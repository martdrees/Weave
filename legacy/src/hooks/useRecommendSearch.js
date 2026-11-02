//@ts-check
/**
 * Recommendation search: seeds, features, filters, results, banned, seen URIs.
 *
 * @param {{
 *   saved: object|null,
 *   prefs: object|null,
 *   tracks: object[],
 * }} opts
 */
function WeaveUseRecommendSearch(opts) {
  const react = Spicetify.React;
  const saved = opts?.saved || null;
  const prefs = opts?.prefs || null;
  const tracks = opts?.tracks || [];

  const [searchOpen, setSearchOpen] = react.useState(
    () => !!saved?.searchOpen || !!prefs?.preferSearchOpen
  );
  const [resultsOpen, setResultsOpen] = react.useState(() => !!saved?.resultsOpen);
  const [seedUris, setSeedUris] = react.useState(() =>
    Array.isArray(saved?.seedUris) ? saved.seedUris : []
  );
  const [searchFeatures, setSearchFeatures] = react.useState(
    () => saved?.searchFeatures || WeaveRecommend.defaultFeatureState()
  );
  // resultLimit + searchFilters: prefs only (ignore legacy session copies).
  const [searchFilters, setSearchFilters] = react.useState(() => {
    const base = {
      ...(WeavePrefs.defaults().searchFilters || {}),
      ...(prefs?.searchFilters || {}),
    };
    return {
      ...base,
      camelotMoves: Array.isArray(base.camelotMoves) ? base.camelotMoves : [],
    };
  });
  const [resultLimit, setResultLimit] = react.useState(() => prefs?.resultLimit || 100);
  const [searchResults, setSearchResults] = react.useState(() =>
    Array.isArray(saved?.searchResults) ? saved.searchResults : []
  );
  const [searchLoading, setSearchLoading] = react.useState(false);
  const [searchFitting, setSearchFitting] = react.useState(false);
  const [searchError, setSearchError] = react.useState(null);
  const [bannedUris, setBannedUris] = react.useState(() =>
    Array.isArray(saved?.bannedUris) ? saved.bannedUris : []
  );

  const searchGenRef = react.useRef(0);
  const searchSeenUrisRef = react.useRef(new Set());

  react.useEffect(() => {
    setSeedUris((prev) => prev.filter((uri) => tracks.some((t) => t.uri === uri)));
  }, [tracks]);

  function cancelInFlight() {
    searchGenRef.current += 1;
    setSearchLoading(false);
  }

  /** Reset search UI when switching playlists (keep panel prefs). */
  function resetForPlaylistLoad() {
    cancelInFlight();
    setSeedUris([]);
    setBannedUris([]);
    setSearchResults([]);
    setResultsOpen(false);
    searchSeenUrisRef.current = new Set();
  }

  /** Full clear when deselecting playlist. */
  function resetForPlaylistClear() {
    cancelInFlight();
    setSeedUris([]);
    setBannedUris([]);
    setSearchResults([]);
    setResultsOpen(false);
    setSearchOpen(false);
    searchSeenUrisRef.current = new Set();
  }

  function closeResultsPanel() {
    cancelInFlight();
    setSearchResults([]);
    setResultsOpen(false);
  }

  function handleToggleSearch() {
    setSearchOpen((open) => {
      if (open) closeResultsPanel();
      return !open;
    });
  }

  function handleToggleSeed(uri) {
    if (!uri) return;
    setSeedUris((prev) =>
      prev.includes(uri) ? prev.filter((u) => u !== uri) : [...prev, uri]
    );
  }

  function removeSeed(uri) {
    if (!uri) return;
    setSeedUris((prev) => prev.filter((u) => u !== uri));
  }

  async function handleFitToSeeds() {
    const ids = seedUris
      .map((uri) => WeaveRecommend.trackIdFromUri(uri))
      .filter(Boolean);
    if (!ids.length) {
      WeaveApi.notify(WeaveI18n.t("notify.selectSeeds"), true);
      return;
    }
    setSearchFitting(true);
    setSearchError(null);
    try {
      const samples = await WeaveFeatures.getFeatureSamples(ids);
      if (!samples.length) {
        WeaveApi.notify(WeaveI18n.t("notify.noSeedFeatures"), true);
        return;
      }
      setSearchFeatures(WeaveRecommend.featuresFromSamples(samples));
      WeaveApi.notify(WeaveI18n.t("notify.fittedSeeds"));
    } catch (err) {
      console.error(err);
      setSearchError(err?.message || WeaveI18n.t("notify.fitFailed"));
    } finally {
      setSearchFitting(false);
    }
  }

  async function handleSearch() {
    const seedTrackIds = seedUris
      .map((uri) => WeaveRecommend.trackIdFromUri(uri))
      .filter(Boolean);
    if (!seedTrackIds.length && !tracks.length) {
      WeaveApi.notify(WeaveI18n.t("notify.needSeedsOrPlaylist"), true);
      return;
    }

    const gen = ++searchGenRef.current;
    setSearchResults([]);
    setSearchLoading(true);
    setSearchError(null);
    setResultsOpen(true);

    const featuresSnap = searchFeatures;
    const filtersSnap = searchFilters;
    const bannedSnap = bannedUris;
    const tracksSnap = tracks;
    const seedUrisSnap = seedUris;
    const resultLimitSnap = resultLimit;

    try {
      const hideExistingOn = !!filtersSnap.hideExisting;
      const hideExistingUris = hideExistingOn
        ? (tracksSnap || []).map((t) => t.uri).filter(Boolean)
        : [];
      const excludeTrackIds = hideExistingOn
        ? (tracksSnap || [])
            .map((t) => t.id || WeaveRecommend.trackIdFromUri(t.uri))
            .filter(Boolean)
        : [];
      const hideExistingTracks = hideExistingOn ? tracksSnap || [] : [];

      let excludeArtistIds = [];
      if (filtersSnap.hideExistingArtists) {
        const ids = new Set();
        for (const t of tracksSnap || []) {
          for (const id of t.artistIds || []) ids.add(id);
        }
        excludeArtistIds = [...ids];
      }

      const yearMin =
        filtersSnap.yearMin === "" ? null : parseInt(filtersSnap.yearMin, 10);
      const yearMax =
        filtersSnap.yearMax === "" ? null : parseInt(filtersSnap.yearMax, 10);

      const seedTracks = (tracksSnap || []).filter((t) => seedUrisSnap.includes(t.uri));
      const camelotSeeds = seedTracks.length ? seedTracks : tracksSnap;
      const camelotMoves = Array.isArray(filtersSnap.camelotMoves)
        ? filtersSnap.camelotMoves.filter(Boolean)
        : [];
      const wantLimit = Number(resultLimitSnap) || WeaveRecommend.DEFAULT_LIMIT;
      // Mild over-fetch for Camelot — collection stops early once enough in-key hits.
      const fetchLimit = camelotMoves.length
        ? Math.min(WeaveRecommend.MAX_LIMIT, Math.max(wantLimit * 2, wantLimit + 40))
        : wantLimit;

      const postFilters = {
        yearMin: Number.isFinite(yearMin) ? yearMin : null,
        yearMax: Number.isFinite(yearMax) ? yearMax : null,
        excludeExplicit: !!filtersSnap.excludeExplicit,
        excludeAberrant: !!filtersSnap.excludeAberrant,
        excludeArtistIds,
        excludeTrackIds,
        hideExistingUris,
        hideExistingTracks,
        bannedUris: bannedSnap,
        includeSeedTracks: false,
        seedTrackIds: [],
      };

      const avoidUris = [...searchSeenUrisRef.current];

      const result = await WeaveRecommend.recommend({
        seedTrackIds,
        seedTracks,
        contextTracks: tracksSnap,
        features: featuresSnap,
        limit: fetchLimit,
        matchTarget: wantLimit,
        camelotMoves,
        camelotSeeds,
        avoidUris,
        filters: postFilters,
      });

      if (gen !== searchGenRef.current) return;

      let list = Array.isArray(result?.tracks) ? result.tracks : [];

      // recommend() already applied Mix in Key + hide-existing when moves are on.
      // Enrich again only for display fields when camelot wasn't applied upstream.
      if (!result?.camelotApplied) {
        try {
          list = await WeaveFeatures.enrichTracks(list.slice());
        } catch (featErr) {
          console.warn("Weave: result key enrich failed", featErr);
        }
        if (gen !== searchGenRef.current) return;
        if (camelotMoves.length) {
          list = WeaveFeatures.filterTracksByCamelotMoves(
            list,
            camelotSeeds,
            camelotMoves
          );
        }
        list = WeaveRecommend.applyPostFilters(list, postFilters);
      } else if (gen !== searchGenRef.current) {
        return;
      }

      if (list.length > wantLimit) {
        list = WeaveRecommend.sampleResults
          ? WeaveRecommend.sampleResults(list, wantLimit, avoidUris)
          : list.slice(0, wantLimit);
      }

      for (const t of list) {
        if (t?.uri) searchSeenUrisRef.current.add(t.uri);
      }
      if (searchSeenUrisRef.current.size > 800) {
        searchSeenUrisRef.current = new Set([...searchSeenUrisRef.current].slice(-400));
      }

      setSearchResults(list);
      if (!list.length) {
        WeaveApi.notify(WeaveI18n.t("notify.noMatches"), true);
      } else if (
        camelotMoves.length &&
        result?.rateLimited &&
        list.length < Math.min(wantLimit, 20)
      ) {
        WeaveApi.notify(
          WeaveI18n.t("notify.rateLimitPartialCamelot", {
            count: list.length,
          }),
          true
        );
      }
    } catch (err) {
      if (gen !== searchGenRef.current) return;
      console.error(err);
      const msg =
        err?.message || err?.body?.error?.message || WeaveI18n.t("notify.searchFailed");
      setSearchError(msg);
      setSearchResults([]);
      WeaveApi.notify(msg, true);
    } finally {
      if (gen === searchGenRef.current) setSearchLoading(false);
    }
  }

  function handleHideResult(track) {
    if (!track?.uri) return;
    setBannedUris((prev) => (prev.includes(track.uri) ? prev : [...prev, track.uri]));
    setSearchResults((prev) => prev.filter((t) => t.uri !== track.uri));
  }

  function removeResult(uri) {
    if (!uri) return;
    setSearchResults((prev) => prev.filter((t) => t.uri !== uri));
  }

  return {
    searchOpen,
    setSearchOpen,
    resultsOpen,
    setResultsOpen,
    seedUris,
    searchFeatures,
    setSearchFeatures,
    searchFilters,
    setSearchFilters,
    resultLimit,
    setResultLimit,
    searchResults,
    searchLoading,
    searchFitting,
    searchError,
    bannedUris,
    resetForPlaylistLoad,
    resetForPlaylistClear,
    closeResultsPanel,
    handleToggleSearch,
    handleToggleSeed,
    removeSeed,
    handleFitToSeeds,
    handleSearch,
    handleHideResult,
    removeResult,
  };
}
