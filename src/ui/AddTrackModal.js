//@ts-check

/**
 * Add Track — catalog Songs search, or Artists → top tracks drill-in.
 *
 * @param {{
 *   open: boolean,
 *   playlistTracks?: object[],
 *   playingUri?: string|null,
 *   isPlaying?: boolean,
 *   onClose?: () => void,
 *   onAddTrack?: (track: object) => void,
 *   onAddTracks?: (tracks: object[]) => void,
 *   onPlay?: (track: object, index?: number) => void,
 * }} props
 */
function MixAppAddTrackModal(props) {
  const react = Spicetify.React;
  const {
    open,
    playlistTracks,
    playingUri,
    isPlaying,
    onClose,
    onAddTrack,
    onAddTracks,
    onPlay,
  } = props;

  const [mode, setMode] = react.useState(/** @type {"songs"|"artists"} */ ("songs"));
  const [query, setQuery] = react.useState("");
  const [results, setResults] = react.useState(/** @type {object[]} */ ([]));
  const [artistHits, setArtistHits] = react.useState(/** @type {object[]} */ ([]));
  const [selectedArtist, setSelectedArtist] = react.useState(
    /** @type {object|null} */ (null)
  );
  const [loading, setLoading] = react.useState(false);
  const [suggestLoading, setSuggestLoading] = react.useState(false);
  const [error, setError] = react.useState(/** @type {string|null} */ (null));
  const genRef = react.useRef(0);
  const suggestGenRef = react.useRef(0);

  const existingIndex = react.useMemo(
    () => MixAppPlaylistOps.buildExistingIndex(playlistTracks),
    [playlistTracks]
  );

  function resetLists() {
    setResults([]);
    setArtistHits([]);
    setSelectedArtist(null);
    setError(null);
  }

  react.useEffect(() => {
    if (!open) {
      genRef.current += 1;
      suggestGenRef.current += 1;
      setQuery("");
      resetLists();
      setLoading(false);
      setSuggestLoading(false);
      setMode("songs");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on close
  }, [open]);

  // Debounced artist suggestions while typing (Artists mode, no drill-in yet).
  react.useEffect(() => {
    if (!open || mode !== "artists" || selectedArtist) return undefined;
    const q = String(query || "").trim();
    if (q.length < 2) {
      suggestGenRef.current += 1;
      setArtistHits([]);
      setSuggestLoading(false);
      setError(null);
      return undefined;
    }

    const gen = ++suggestGenRef.current;
    setSuggestLoading(true);
    const timer = setTimeout(async () => {
      try {
        const list = await MixAppApi.searchArtists(q, { limit: 8 });
        if (gen !== suggestGenRef.current) return;
        setArtistHits(list);
        setError(list.length ? null : MixAppI18n.t("addTrack.noArtists"));
      } catch (err) {
        if (gen !== suggestGenRef.current) return;
        console.error(err);
        setArtistHits([]);
        setError(err?.message || MixAppI18n.t("notify.searchFailed"));
      } finally {
        if (gen === suggestGenRef.current) setSuggestLoading(false);
      }
    }, 280);

    return () => {
      clearTimeout(timer);
    };
  }, [open, mode, query, selectedArtist]);

  function switchMode(next) {
    if (next === mode) return;
    genRef.current += 1;
    suggestGenRef.current += 1;
    setMode(next);
    setQuery("");
    resetLists();
    setLoading(false);
    setSuggestLoading(false);
  }

  async function enrichList(list) {
    if (!list?.length) return list || [];
    try {
      return await MixAppFeatures.enrichTracks(list.slice());
    } catch (enrichErr) {
      console.warn("Weave: add-track enrich failed", enrichErr);
      return list;
    }
  }

  async function runSongSearch(e) {
    e?.preventDefault?.();
    if (mode !== "songs") return;
    const q = String(query || "").trim();
    if (!q) return;
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    setSelectedArtist(null);
    setArtistHits([]);
    try {
      let list = await MixAppApi.searchTracks(q, { limit: 30 });
      if (gen !== genRef.current) return;
      list = await enrichList(list);
      if (gen !== genRef.current) return;
      setResults(list);
      if (!list.length) setError(MixAppI18n.t("results.empty"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setResults([]);
      setError(err?.message || MixAppI18n.t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }

  async function openArtist(artist) {
    if (!artist?.uri && !artist?.id) return;
    suggestGenRef.current += 1;
    const gen = ++genRef.current;
    setSelectedArtist(artist);
    setArtistHits([]);
    setResults([]);
    setError(null);
    setLoading(true);
    setSuggestLoading(false);
    try {
      let list = await MixAppApi.getArtistTopTracks(artist.id || artist.uri, {
        limit: 30,
      });
      if (gen !== genRef.current) return;
      list = await enrichList(list);
      if (gen !== genRef.current) return;
      setResults(list);
      if (!list.length) setError(MixAppI18n.t("addTrack.noTopTracks"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setResults([]);
      setError(err?.message || MixAppI18n.t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }

  function backToArtistSearch() {
    genRef.current += 1;
    setSelectedArtist(null);
    setResults([]);
    setError(null);
    setLoading(false);
    // Suggestions effect re-runs from current query.
  }

  function addAllNew() {
    const batch = (results || []).filter(
      (t) => t?.uri && !MixAppPlaylistOps.isInIndex(existingIndex, t)
    );
    if (!batch.length) {
      MixAppApi.notify(MixAppI18n.t("addTrack.noNewTracks"), true);
      return;
    }
    if (typeof onAddTracks === "function") {
      onAddTracks(batch);
    } else {
      for (const t of batch) onAddTrack?.(t);
    }
  }

  function onArtistFormSubmit(e) {
    e?.preventDefault?.();
    if (selectedArtist) return;
    if (artistHits.length) {
      openArtist(artistHits[0]);
      return;
    }
  }

  function formatFollowers(n) {
    if (n == null || !Number.isFinite(Number(n))) return null;
    const v = Number(n);
    if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + "K";
    return String(v);
  }

  const showingTracks = mode === "songs" || !!selectedArtist;
  const newCount = showingTracks
    ? (results || []).filter(
        (t) => t?.uri && !MixAppPlaylistOps.isInIndex(existingIndex, t)
      ).length
    : 0;

  const meta = selectedArtist
    ? MixAppI18n.t("addTrack.artistMeta", {
        name: selectedArtist.name || "",
        count: results.length,
      })
    : results.length
      ? MixAppI18n.t("results.meta", { count: results.length })
      : null;

  return h(
    MixAppModal,
    {
      open,
      title: MixAppI18n.t("addTrack.title"),
      meta,
      onClose,
      ariaLabel: MixAppI18n.t("addTrack.title"),
      className: "mixapp-find-modal mixapp-add-track-modal",
    },
    h(
      "div",
      { className: "mixapp-add-track-toolbar" },
      h(
        "div",
        {
          className: "mixapp-add-track-modes",
          role: "tablist",
          "aria-label": MixAppI18n.t("addTrack.modeLabel"),
        },
        h(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": mode === "songs",
            className:
              "mixapp-btn mixapp-btn-ghost" +
              (mode === "songs" ? " mixapp-btn-active" : ""),
            onClick: () => switchMode("songs"),
          },
          MixAppI18n.t("addTrack.modeSongs")
        ),
        h(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": mode === "artists",
            className:
              "mixapp-btn mixapp-btn-ghost" +
              (mode === "artists" ? " mixapp-btn-active" : ""),
            onClick: () => switchMode("artists"),
          },
          MixAppI18n.t("addTrack.modeArtists")
        )
      ),
      selectedArtist
        ? h(
            "div",
            { className: "mixapp-add-track-artist-bar" },
            h(
              "button",
              {
                type: "button",
                className: "mixapp-btn mixapp-btn-ghost mixapp-add-track-back",
                onClick: backToArtistSearch,
              },
              MixAppI18n.t("addTrack.backToArtists")
            ),
            h(
              "div",
              { className: "mixapp-add-track-artist-chip" },
              selectedArtist.imageUrl
                ? h("img", {
                    className: "mixapp-add-track-artist-avatar",
                    src: selectedArtist.imageUrl,
                    alt: "",
                  })
                : h("div", {
                    className:
                      "mixapp-add-track-artist-avatar mixapp-add-track-artist-avatar-fallback",
                    "aria-hidden": "true",
                  }),
              h(
                "span",
                { className: "mixapp-add-track-artist-name" },
                selectedArtist.name || ""
              )
            ),
            h(
              "button",
              {
                type: "button",
                className: "mixapp-btn mixapp-btn-primary",
                disabled: loading || newCount === 0,
                onClick: addAllNew,
              },
              MixAppI18n.t("addTrack.addAllNew")
            )
          )
        : h(
            "form",
            {
              className: "mixapp-find-search-bar mixapp-add-track-search",
              onSubmit: mode === "songs" ? runSongSearch : onArtistFormSubmit,
            },
            h("input", {
              type: "search",
              className: "mixapp-find-input",
              placeholder:
                mode === "songs"
                  ? MixAppI18n.t("addTrack.placeholder")
                  : MixAppI18n.t("addTrack.placeholderArtist"),
              value: query,
              autoFocus: true,
              "data-autofocus": true,
              onChange: (ev) => setQuery(ev.target.value),
            }),
            mode === "songs"
              ? h(
                  "button",
                  {
                    type: "submit",
                    className: "mixapp-btn mixapp-btn-primary",
                    disabled: loading || !String(query || "").trim(),
                  },
                  loading
                    ? MixAppI18n.t("picker.loading")
                    : MixAppI18n.t("addTrack.search")
                )
              : null
          )
    ),
    error ? h("div", { className: "mixapp-find-error" }, error) : null,
    mode === "artists" && !selectedArtist
      ? h(
          "div",
          { className: "mixapp-add-track-suggest" },
          suggestLoading && !artistHits.length
            ? h(
                "div",
                { className: "mixapp-add-track-suggest-status" },
                MixAppI18n.t("picker.loading")
              )
            : null,
          !suggestLoading &&
            String(query || "").trim().length < 2 &&
            !artistHits.length
            ? h(
                "div",
                { className: "mixapp-add-track-suggest-status" },
                MixAppI18n.t("addTrack.artistSuggestHint")
              )
            : null,
          artistHits.length
            ? h(
                "div",
                {
                  className: "mixapp-add-track-artist-list",
                  role: "listbox",
                  "aria-label": MixAppI18n.t("addTrack.modeArtists"),
                },
                artistHits.map((artist, index) => {
                  const followers = formatFollowers(artist.followers);
                  return h(
                    "button",
                    {
                      type: "button",
                      key: artist.uri || artist.id || index,
                      role: "option",
                      className: "mixapp-add-track-artist-row",
                      onClick: () => openArtist(artist),
                    },
                    artist.imageUrl
                      ? h("img", {
                          className: "mixapp-add-track-artist-avatar",
                          src: artist.imageUrl,
                          alt: "",
                        })
                      : h("div", {
                          className:
                            "mixapp-add-track-artist-avatar mixapp-add-track-artist-avatar-fallback",
                          "aria-hidden": "true",
                        }),
                    h(
                      "div",
                      { className: "mixapp-add-track-artist-meta" },
                      h(
                        "div",
                        { className: "mixapp-add-track-artist-name" },
                        artist.name || ""
                      ),
                      followers
                        ? h(
                            "div",
                            { className: "mixapp-add-track-artist-sub" },
                            MixAppI18n.t("addTrack.followers", { count: followers })
                          )
                        : null
                    )
                  );
                })
              )
            : null
        )
      : h(
          "div",
          { className: "mixapp-search-results-body" },
          h(MixAppTrackTable, {
            tracks: results,
            playingUri,
            isPlaying,
            onPlay,
            onAddTrack,
            disabledReason: (track) =>
              MixAppPlaylistOps.isInIndex(existingIndex, track)
                ? MixAppI18n.t("notify.alreadyInPlaylist")
                : null,
            rowClassName: (track) =>
              MixAppPlaylistOps.isInIndex(existingIndex, track)
                ? "is-in-playlist"
                : "",
            loading,
            loadingLabel: MixAppI18n.t("picker.loading"),
            emptyLabel:
              mode === "artists"
                ? MixAppI18n.t("addTrack.emptyArtist")
                : MixAppI18n.t("addTrack.empty"),
          })
        )
  );
}
