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
function MixAppUseRecommendSearch(opts) {
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
    () => saved?.searchFeatures || MixAppRecommend.defaultFeatureState()
  );
  // resultLimit + searchFilters: prefs only (ignore legacy session copies).
  const [searchFilters, setSearchFilters] = react.useState(() => {
    const base = {
      ...(MixAppPrefs.defaults().searchFilters || {}),
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
      .map((uri) => MixAppRecommend.trackIdFromUri(uri))
      .filter(Boolean);
    if (!ids.length) {
      MixAppApi.notify("Select seed tracks first", true);
      return;
    }
    setSearchFitting(true);
    setSearchError(null);
    try {
      const samples = await MixAppFeatures.getFeatureSamples(ids);
      if (!samples.length) {
        MixAppApi.notify("No audio features for those seeds", true);
        return;
      }
      setSearchFeatures(MixAppRecommend.featuresFromSamples(samples));
      MixAppApi.notify("Feature ranges fitted to seeds");
    } catch (err) {
      console.error(err);
      setSearchError(err?.message || "Failed to fit features");
    } finally {
      setSearchFitting(false);
    }
  }

  async function handleSearch() {
    const seedTrackIds = seedUris
      .map((uri) => MixAppRecommend.trackIdFromUri(uri))
      .filter(Boolean);
    if (!seedTrackIds.length && !tracks.length) {
      MixAppApi.notify("Load a playlist or mark seed tracks first", true);
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
            .map((t) => t.id || MixAppRecommend.trackIdFromUri(t.uri))
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
      const wantLimit = Number(resultLimitSnap) || MixAppRecommend.DEFAULT_LIMIT;
      const fetchLimit = camelotMoves.length
        ? Math.min(MixAppRecommend.MAX_LIMIT, Math.max(wantLimit * 3, wantLimit + 80))
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

      const result = await MixAppRecommend.recommend({
        seedTrackIds,
        seedTracks,
        contextTracks: tracksSnap,
        features: featuresSnap,
        limit: fetchLimit,
        avoidUris,
        filters: postFilters,
      });

      if (gen !== searchGenRef.current) return;

      let list = Array.isArray(result?.tracks) ? result.tracks : [];
      try {
        list = await MixAppFeatures.enrichTracks(list.slice());
      } catch (featErr) {
        console.warn("Weave: result key enrich failed", featErr);
      }

      if (gen !== searchGenRef.current) return;

      if (camelotMoves.length) {
        list = MixAppFeatures.filterTracksByCamelotMoves(
          list,
          camelotSeeds,
          camelotMoves
        );
      }

      list = MixAppRecommend.applyPostFilters(list, postFilters);
      if (list.length > wantLimit) {
        list = MixAppRecommend.sampleResults
          ? MixAppRecommend.sampleResults(list, wantLimit, avoidUris)
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
        MixAppApi.notify(
          "No matches after filters — try disabling filters or ranges",
          true
        );
      }
    } catch (err) {
      if (gen !== searchGenRef.current) return;
      console.error(err);
      const msg = err?.message || err?.body?.error?.message || "Search request failed";
      setSearchError(msg);
      setSearchResults([]);
      MixAppApi.notify(msg, true);
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
