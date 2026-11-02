//@ts-check

/**
 * Add Track — catalog Songs search, or Artists → popular / albums drill-in.
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
function WeaveAddTrackModal(props) {
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
  /** @type {"popular"|"albums"|"album"} */
  const [artistView, setArtistView] = react.useState("popular");
  const [albums, setAlbums] = react.useState(/** @type {object[]} */ ([]));
  const [selectedAlbum, setSelectedAlbum] = react.useState(
    /** @type {object|null} */ (null)
  );
  const [loading, setLoading] = react.useState(false);
  const [suggestLoading, setSuggestLoading] = react.useState(false);
  const [error, setError] = react.useState(/** @type {string|null} */ (null));
  const genRef = react.useRef(0);
  const suggestGenRef = react.useRef(0);

  const existingIndex = react.useMemo(
    () => WeavePlaylistOps.buildExistingIndex(playlistTracks),
    [playlistTracks]
  );

  function resetLists() {
    setResults([]);
    setArtistHits([]);
    setSelectedArtist(null);
    setArtistView("popular");
    setAlbums([]);
    setSelectedAlbum(null);
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
    // Reset only on close (intentional deps omission).
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
        const list = await WeaveApi.searchArtists(q, { limit: 30 });
        if (gen !== suggestGenRef.current) return;
        setArtistHits(list);
        setError(list.length ? null : WeaveI18n.t("addTrack.noArtists"));
      } catch (err) {
        if (gen !== suggestGenRef.current) return;
        console.error(err);
        setArtistHits([]);
        setError(err?.message || WeaveI18n.t("notify.searchFailed"));
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
      return await WeaveFeatures.enrichTracks(list.slice());
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
    setArtistView("popular");
    setAlbums([]);
    setSelectedAlbum(null);
    try {
      let list = await WeaveApi.searchTracks(q, { limit: 30 });
      if (gen !== genRef.current) return;
      list = await enrichList(list);
      if (gen !== genRef.current) return;
      setResults(list);
      if (!list.length) setError(WeaveI18n.t("results.empty"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setResults([]);
      setError(err?.message || WeaveI18n.t("notify.searchFailed"));
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
    setAlbums([]);
    setSelectedAlbum(null);
    setArtistView("popular");
    setError(null);
    setLoading(true);
    setSuggestLoading(false);
    try {
      let list = await WeaveApi.getArtistTopTracks(artist.id || artist.uri, {
        limit: 30,
      });
      if (gen !== genRef.current) return;
      list = await enrichList(list);
      if (gen !== genRef.current) return;
      setResults(list);
      if (!list.length) setError(WeaveI18n.t("addTrack.noTopTracks"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setResults([]);
      setError(err?.message || WeaveI18n.t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }

  async function loadAlbums() {
    if (!selectedArtist) return;
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    setSelectedAlbum(null);
    setResults([]);
    setArtistView("albums");
    try {
      const list = await WeaveApi.getArtistAlbums(
        selectedArtist.id || selectedArtist.uri,
        { limit: 50 }
      );
      if (gen !== genRef.current) return;
      setAlbums(list);
      if (!list.length) setError(WeaveI18n.t("addTrack.noAlbums"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setAlbums([]);
      setError(err?.message || WeaveI18n.t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }

  async function openAlbum(album) {
    if (!album?.uri && !album?.id) return;
    const gen = ++genRef.current;
    setSelectedAlbum(album);
    setArtistView("album");
    setResults([]);
    setError(null);
    setLoading(true);
    try {
      let list = await WeaveApi.getAlbumTracks(album.uri || album.id, {
        limit: 80,
      });
      if (gen !== genRef.current) return;
      list = await enrichList(list);
      if (gen !== genRef.current) return;
      setResults(list);
      if (!list.length) setError(WeaveI18n.t("addTrack.noAlbumTracks"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setResults([]);
      setError(err?.message || WeaveI18n.t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }

  async function backToPopular() {
    if (!selectedArtist) return;
    const gen = ++genRef.current;
    setSelectedAlbum(null);
    setAlbums([]);
    setArtistView("popular");
    setResults([]);
    setError(null);
    setLoading(true);
    try {
      let list = await WeaveApi.getArtistTopTracks(
        selectedArtist.id || selectedArtist.uri,
        { limit: 30 }
      );
      if (gen !== genRef.current) return;
      list = await enrichList(list);
      if (gen !== genRef.current) return;
      setResults(list);
      if (!list.length) setError(WeaveI18n.t("addTrack.noTopTracks"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setResults([]);
      setError(err?.message || WeaveI18n.t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }

  function backToAlbums() {
    genRef.current += 1;
    setSelectedAlbum(null);
    setResults([]);
    setArtistView("albums");
    setError(albums.length ? null : WeaveI18n.t("addTrack.noAlbums"));
    setLoading(false);
  }

  function backToArtistSearch() {
    genRef.current += 1;
    setSelectedArtist(null);
    setSelectedAlbum(null);
    setAlbums([]);
    setArtistView("popular");
    setResults([]);
    setError(null);
    setLoading(false);
  }

  function handleArtistBack() {
    if (artistView === "album") {
      backToAlbums();
      return;
    }
    if (artistView === "albums") {
      backToPopular();
      return;
    }
    backToArtistSearch();
  }

  function artistBackLabel() {
    if (artistView === "album") return WeaveI18n.t("addTrack.backToAlbums");
    if (artistView === "albums") return WeaveI18n.t("addTrack.backToPopular");
    return WeaveI18n.t("addTrack.backToArtists");
  }

  function addAllNew() {
    const batch = (results || []).filter(
      (t) => t?.uri && !WeavePlaylistOps.isInIndex(existingIndex, t)
    );
    if (!batch.length) {
      WeaveApi.notify(WeaveI18n.t("addTrack.noNewTracks"), true);
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

  function albumSubtitle(album) {
    const parts = [];
    if (album?.year) parts.push(String(album.year));
    if (album?.group === "single" || album?.group === "singles") {
      parts.push(WeaveI18n.t("addTrack.albumGroupSingle"));
    } else if (album?.group === "compilation" || album?.group === "compilations") {
      parts.push(WeaveI18n.t("addTrack.albumGroupCompilation"));
    }
    if (album?.totalTracks != null) {
      parts.push(WeaveI18n.t("addTrack.albumTrackCount", { count: album.totalTracks }));
    }
    return parts.join(" · ");
  }

  const showingTrackTable =
    mode === "songs" ||
    (selectedArtist && (artistView === "popular" || artistView === "album"));
  const newCount = showingTrackTable
    ? (results || []).filter(
        (t) => t?.uri && !WeavePlaylistOps.isInIndex(existingIndex, t)
      ).length
    : 0;

  let meta = null;
  if (selectedArtist && artistView === "album" && selectedAlbum) {
    meta = WeaveI18n.t("addTrack.albumMeta", {
      album: selectedAlbum.name || "",
      count: results.length,
    });
  } else if (selectedArtist && artistView === "albums") {
    meta = WeaveI18n.t("addTrack.albumsMeta", {
      name: selectedArtist.name || "",
      count: albums.length,
    });
  } else if (selectedArtist) {
    meta = WeaveI18n.t("addTrack.artistMeta", {
      name: selectedArtist.name || "",
      count: results.length,
    });
  } else if (results.length) {
    meta = WeaveI18n.t("results.meta", { count: results.length });
  }

  return h(
    WeaveModal,
    {
      open,
      title: WeaveI18n.t("addTrack.title"),
      meta,
      onClose,
      ariaLabel: WeaveI18n.t("addTrack.title"),
      className: "weave-find-modal weave-add-track-modal",
    },
    h(
      "div",
      { className: "weave-add-track-toolbar" },
      h(
        "div",
        {
          className: "weave-add-track-modes",
          role: "tablist",
          "aria-label": WeaveI18n.t("addTrack.modeLabel"),
        },
        h(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": mode === "songs",
            className:
              "weave-btn weave-btn-ghost" +
              (mode === "songs" ? " weave-btn-active" : ""),
            onClick: () => switchMode("songs"),
          },
          WeaveI18n.t("addTrack.modeSongs")
        ),
        h(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": mode === "artists",
            className:
              "weave-btn weave-btn-ghost" +
              (mode === "artists" ? " weave-btn-active" : ""),
            onClick: () => switchMode("artists"),
          },
          WeaveI18n.t("addTrack.modeArtists")
        )
      ),
      selectedArtist
        ? h(
            "div",
            { className: "weave-add-track-artist-bar" },
            h(
              "button",
              {
                type: "button",
                className: "weave-btn weave-btn-ghost weave-add-track-back",
                onClick: handleArtistBack,
              },
              artistBackLabel()
            ),
            h(
              "div",
              { className: "weave-add-track-artist-chip" },
              selectedArtist.imageUrl
                ? h("img", {
                    className: "weave-add-track-artist-avatar",
                    src: selectedArtist.imageUrl,
                    alt: "",
                  })
                : h("div", {
                    className:
                      "weave-add-track-artist-avatar weave-add-track-artist-avatar-fallback",
                    "aria-hidden": "true",
                  }),
              h(
                "div",
                { className: "weave-add-track-artist-meta" },
                h(
                  "span",
                  { className: "weave-add-track-artist-name" },
                  selectedArtist.name || ""
                ),
                selectedAlbum
                  ? h(
                      "span",
                      { className: "weave-add-track-artist-sub" },
                      selectedAlbum.name || ""
                    )
                  : artistView === "albums"
                    ? h(
                        "span",
                        { className: "weave-add-track-artist-sub" },
                        WeaveI18n.t("addTrack.albumsHeading")
                      )
                    : h(
                        "span",
                        { className: "weave-add-track-artist-sub" },
                        WeaveI18n.t("addTrack.popularHeading")
                      )
              )
            ),
            artistView === "popular"
              ? h(
                  "button",
                  {
                    type: "button",
                    className: "weave-btn",
                    disabled: loading,
                    onClick: loadAlbums,
                  },
                  WeaveI18n.t("addTrack.loadAlbums")
                )
              : null,
            artistView === "popular" || artistView === "album"
              ? h(
                  "button",
                  {
                    type: "button",
                    className: "weave-btn weave-btn-primary",
                    disabled: loading || newCount === 0,
                    onClick: addAllNew,
                  },
                  WeaveI18n.t("addTrack.addAllNew")
                )
              : null
          )
        : h(
            "form",
            {
              className: "weave-find-search-bar weave-add-track-search",
              onSubmit: mode === "songs" ? runSongSearch : onArtistFormSubmit,
            },
            h("input", {
              type: "search",
              className: "weave-find-input",
              placeholder:
                mode === "songs"
                  ? WeaveI18n.t("addTrack.placeholder")
                  : WeaveI18n.t("addTrack.placeholderArtist"),
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
                    className: "weave-btn weave-btn-primary",
                    disabled: loading || !String(query || "").trim(),
                  },
                  loading
                    ? WeaveI18n.t("picker.loading")
                    : WeaveI18n.t("addTrack.search")
                )
              : null
          )
    ),
    error ? h("div", { className: "weave-find-error" }, error) : null,
    mode === "artists" && !selectedArtist
      ? h(
          "div",
          { className: "weave-add-track-suggest" },
          suggestLoading && !artistHits.length
            ? h(
                "div",
                { className: "weave-add-track-suggest-status" },
                WeaveI18n.t("picker.loading")
              )
            : null,
          !suggestLoading && String(query || "").trim().length < 2 && !artistHits.length
            ? h(
                "div",
                { className: "weave-add-track-suggest-status" },
                WeaveI18n.t("addTrack.artistSuggestHint")
              )
            : null,
          artistHits.length
            ? h(
                "div",
                {
                  className: "weave-add-track-artist-list",
                  role: "listbox",
                  "aria-label": WeaveI18n.t("addTrack.modeArtists"),
                },
                artistHits.map((artist, index) => {
                  const followers = formatFollowers(artist.followers);
                  return h(
                    "button",
                    {
                      type: "button",
                      key: artist.uri || artist.id || index,
                      role: "option",
                      className: "weave-add-track-artist-row",
                      onClick: () => openArtist(artist),
                    },
                    artist.imageUrl
                      ? h("img", {
                          className: "weave-add-track-artist-avatar",
                          src: artist.imageUrl,
                          alt: "",
                        })
                      : h("div", {
                          className:
                            "weave-add-track-artist-avatar weave-add-track-artist-avatar-fallback",
                          "aria-hidden": "true",
                        }),
                    h(
                      "div",
                      { className: "weave-add-track-artist-meta" },
                      h(
                        "div",
                        { className: "weave-add-track-artist-name" },
                        artist.name || ""
                      ),
                      followers
                        ? h(
                            "div",
                            { className: "weave-add-track-artist-sub" },
                            WeaveI18n.t("addTrack.followers", {
                              count: followers,
                            })
                          )
                        : null
                    )
                  );
                })
              )
            : null
        )
      : selectedArtist && artistView === "albums"
        ? h(
            "div",
            { className: "weave-add-track-suggest" },
            loading && !albums.length
              ? h(
                  "div",
                  { className: "weave-add-track-suggest-status" },
                  WeaveI18n.t("picker.loading")
                )
              : null,
            albums.length
              ? h(
                  "div",
                  {
                    className: "weave-add-track-album-list",
                    role: "listbox",
                    "aria-label": WeaveI18n.t("addTrack.albumsHeading"),
                  },
                  albums.map((album, index) => {
                    const sub = albumSubtitle(album);
                    return h(
                      "button",
                      {
                        type: "button",
                        key: album.uri || album.id || index,
                        role: "option",
                        className: "weave-add-track-album-row",
                        onClick: () => openAlbum(album),
                      },
                      album.imageUrl
                        ? h("img", {
                            className: "weave-add-track-album-cover",
                            src: album.imageUrl,
                            alt: "",
                          })
                        : h("div", {
                            className:
                              "weave-add-track-album-cover weave-add-track-album-cover-fallback",
                            "aria-hidden": "true",
                          }),
                      h(
                        "div",
                        { className: "weave-add-track-artist-meta" },
                        h(
                          "div",
                          { className: "weave-add-track-artist-name" },
                          album.name || ""
                        ),
                        sub
                          ? h("div", { className: "weave-add-track-artist-sub" }, sub)
                          : null
                      )
                    );
                  })
                )
              : null
          )
        : h(
            "div",
            { className: "weave-search-results-body" },
            h(WeaveTrackTable, {
              tracks: results,
              playingUri,
              isPlaying,
              onPlay,
              onAddTrack,
              disabledReason: (track) =>
                WeavePlaylistOps.isInIndex(existingIndex, track)
                  ? WeaveI18n.t("notify.alreadyInPlaylist")
                  : null,
              rowClassName: (track) =>
                WeavePlaylistOps.isInIndex(existingIndex, track)
                  ? "is-in-playlist"
                  : "",
              loading,
              loadingLabel: WeaveI18n.t("picker.loading"),
              emptyLabel:
                mode === "artists"
                  ? WeaveI18n.t("addTrack.emptyArtist")
                  : WeaveI18n.t("addTrack.empty"),
            })
          )
  );
}
