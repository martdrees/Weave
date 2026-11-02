//@ts-check

/** Phase 5 — MixMoose “Copy from Playlist”: import tracks from another list. */
function WeaveCopyPlaylistModal(props) {
  const react = Spicetify.React;
  const {
    open,
    libraryPlaylists,
    currentPlaylistUri,
    playlistTracks,
    playingUri,
    isPlaying,
    onClose,
    onAddTrack,
    onAddTracks,
    onPlay,
  } = props;

  const [mode, setMode] = react.useState("library"); // library | search
  const [query, setQuery] = react.useState("");
  const [searchHits, setSearchHits] = react.useState([]);
  const [searchLoading, setSearchLoading] = react.useState(false);
  const [selectedUri, setSelectedUri] = react.useState(null);
  const [sourceName, setSourceName] = react.useState("");
  const [sourceTracks, setSourceTracks] = react.useState([]);
  const [tracksLoading, setTracksLoading] = react.useState(false);
  const [selected, setSelected] = react.useState(() => new Set());
  const [error, setError] = react.useState(null);
  const genRef = react.useRef(0);

  const existingIndex = react.useMemo(
    () => WeavePlaylistOps.buildExistingIndex(playlistTracks),
    [playlistTracks]
  );

  react.useEffect(() => {
    if (!open) {
      genRef.current += 1;
      setMode("library");
      setQuery("");
      setSearchHits([]);
      setSelectedUri(null);
      setSourceName("");
      setSourceTracks([]);
      setSelected(new Set());
      setError(null);
      setSearchLoading(false);
      setTracksLoading(false);
    }
  }, [open]);

  function isInPlaylist(track) {
    return WeavePlaylistOps.isInIndex(existingIndex, track);
  }

  const libraryOptions = (libraryPlaylists || []).filter(
    (p) => p?.uri && p.uri !== currentPlaylistUri
  );

  async function runPlaylistSearch(e) {
    e?.preventDefault?.();
    const q = String(query || "").trim();
    if (!q) return;
    const gen = ++genRef.current;
    setSearchLoading(true);
    setError(null);
    try {
      const hits = await WeaveApi.searchPlaylists(q, { limit: 20 });
      if (gen !== genRef.current) return;
      setSearchHits(hits.filter((p) => p.uri !== currentPlaylistUri));
      if (!hits.length) setError(WeaveI18n.t("picker.empty"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setSearchHits([]);
      setError(err?.message || WeaveI18n.t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setSearchLoading(false);
    }
  }

  async function loadSource(pl) {
    if (!pl?.uri) return;
    const gen = ++genRef.current;
    setSelectedUri(pl.uri);
    setSourceName(pl.name || WeaveI18n.t("picker.playlist"));
    setSourceTracks([]);
    setSelected(new Set());
    setTracksLoading(true);
    setError(null);
    try {
      let items = await WeaveApi.getPlaylistTracks(pl.uri);
      if (gen !== genRef.current) return;
      if (items.length) {
        try {
          items = await WeaveFeatures.enrichTracks(items.slice());
        } catch (enrichErr) {
          console.warn("Weave: copy-playlist enrich failed", enrichErr);
        }
      }
      if (gen !== genRef.current) return;
      setSourceTracks(items);
      if (!items.length) setError(WeaveI18n.t("results.empty"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setSourceTracks([]);
      setError(err?.message || WeaveI18n.t("notify.failedPlaylist"));
    } finally {
      if (gen === genRef.current) setTracksLoading(false);
    }
  }

  function toggleSelect(uri) {
    if (!uri) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }

  function selectAddable() {
    const next = new Set();
    for (const t of sourceTracks) {
      if (t?.uri && !isInPlaylist(t)) next.add(t.uri);
    }
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function addSelected() {
    const batch = sourceTracks.filter(
      (t) => t?.uri && selected.has(t.uri) && !isInPlaylist(t)
    );
    if (!batch.length) {
      WeaveApi.notify(WeaveI18n.t("copy.noSelection"), true);
      return;
    }
    onAddTracks?.(batch);
    setSelected(new Set());
  }

  function addAllNew() {
    const batch = sourceTracks.filter((t) => t?.uri && !isInPlaylist(t));
    if (!batch.length) {
      WeaveApi.notify(WeaveI18n.t("copy.allExist"), true);
      return;
    }
    onAddTracks?.(batch);
    setSelected(new Set());
  }

  const playlistList = mode === "library" ? libraryOptions : searchHits;

  return h(
    WeaveModal,
    {
      open,
      title: WeaveI18n.t("copy.title"),
      onClose,
      ariaLabel: WeaveI18n.t("copy.title"),
      className: "weave-find-modal weave-copy-modal",
    },
    h(
      "div",
      { className: "weave-copy-layout" },
      h(
        "aside",
        { className: "weave-copy-sidebar" },
        h(
          "div",
          { className: "weave-copy-tabs" },
          h(
            "button",
            {
              type: "button",
              className:
                "weave-btn weave-btn-ghost" +
                (mode === "library" ? " weave-btn-active" : ""),
              onClick: () => setMode("library"),
            },
            "Your library"
          ),
          h(
            "button",
            {
              type: "button",
              className:
                "weave-btn weave-btn-ghost" +
                (mode === "search" ? " weave-btn-active" : ""),
              onClick: () => setMode("search"),
            },
            WeaveI18n.t("common.search")
          )
        ),
        mode === "search"
          ? h(
              "form",
              {
                className: "weave-find-search-bar weave-find-search-bar-stack",
                onSubmit: runPlaylistSearch,
              },
              h("input", {
                type: "search",
                className: "weave-find-input",
                placeholder: WeaveI18n.t("copy.placeholder"),
                value: query,
                onChange: (e) => setQuery(e.target.value),
              }),
              h(
                "button",
                {
                  type: "submit",
                  className: "weave-btn weave-btn-primary",
                  disabled: searchLoading || !String(query || "").trim(),
                },
                searchLoading ? "…" : "Search"
              )
            )
          : null,
        h(
          "div",
          { className: "weave-copy-playlist-list" },
          !playlistList.length
            ? h(
                "div",
                { className: "weave-recommend-meta" },
                mode === "library"
                  ? "No other playlists in your library."
                  : "Search for a playlist to copy from."
              )
            : playlistList.map((pl) =>
                h(
                  "button",
                  {
                    key: pl.uri,
                    type: "button",
                    className:
                      "weave-copy-playlist-item" +
                      (selectedUri === pl.uri ? " is-active" : ""),
                    onClick: () => loadSource(pl),
                  },
                  h("span", { className: "weave-copy-playlist-name" }, pl.name),
                  h(
                    "span",
                    { className: "weave-recommend-meta" },
                    pl.totalLength != null
                      ? WeaveI18n.t("picker.tracks", { count: pl.totalLength })
                      : pl.ownerName || ""
                  )
                )
              )
        )
      ),
      h(
        "section",
        { className: "weave-copy-main" },
        h(
          "div",
          { className: "weave-copy-main-head" },
          h(
            "div",
            { className: "weave-search-panel-title-row" },
            h("h3", null, sourceName || WeaveI18n.t("picker.select")),
            sourceTracks.length
              ? h(
                  "span",
                  { className: "weave-recommend-meta" },
                  sourceTracks.length + " tracks · " + selected.size + " selected"
                )
              : null
          ),
          sourceTracks.length
            ? h(
                "div",
                { className: "weave-copy-actions" },
                h(
                  "button",
                  {
                    type: "button",
                    className: "weave-btn weave-btn-ghost",
                    onClick: selectAddable,
                  },
                  "Select new"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "weave-btn weave-btn-ghost",
                    onClick: clearSelection,
                    disabled: !selected.size,
                  },
                  "Clear"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "weave-btn",
                    onClick: addSelected,
                    disabled: !selected.size,
                  },
                  WeaveI18n.t("results.addSelected")
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "weave-btn weave-btn-primary",
                    onClick: addAllNew,
                  },
                  "Add all new"
                )
              )
            : null
        ),
        error ? h("div", { className: "weave-find-error" }, error) : null,
        h(
          "div",
          { className: "weave-search-results-body" },
          tracksLoading
            ? h(
                "div",
                { className: "weave-arranger-empty weave-search-waiting" },
                h("div", {
                  className: "weave-spinner",
                  "aria-hidden": "true",
                }),
                h(
                  "p",
                  { className: "weave-search-waiting-label" },
                  WeaveI18n.t("picker.loading")
                )
              )
            : !selectedUri
              ? h(
                  "div",
                  { className: "weave-arranger-empty" },
                  "Pick a playlist on the left to browse its tracks."
                )
              : !sourceTracks.length
                ? h("div", { className: "weave-arranger-empty" }, "No tracks to show.")
                : h(
                    "div",
                    { className: "weave-find-list" },
                    sourceTracks.map((track, index) => {
                      const inPl = isInPlaylist(track);
                      const checked = !!(track.uri && selected.has(track.uri));
                      return h(
                        "div",
                        {
                          key: track.uid || track.uri || index,
                          className: "weave-find-row" + (inPl ? " is-in-playlist" : ""),
                        },
                        h("input", {
                          type: "checkbox",
                          checked: checked,
                          disabled: inPl || !track.uri,
                          onChange: () => toggleSelect(track.uri),
                          title: inPl
                            ? WeaveI18n.t("notify.alreadyInPlaylist")
                            : WeaveI18n.t("results.add"),
                        }),
                        h(WeavePlayButton, {
                          track,
                          playingUri,
                          isPlaying,
                          onPlay,
                          index,
                        }),
                        h(
                          "div",
                          { className: "weave-find-meta" },
                          h(
                            "div",
                            { className: "weave-find-title" },
                            track.name || WeaveI18n.t("common.unknown")
                          ),
                          h(
                            "div",
                            { className: "weave-find-sub" },
                            [track.artists, track.album].filter(Boolean).join(" · ")
                          )
                        ),
                        (() => {
                          const keyLabel = WeaveFeatures.formatDisplayKey(track);
                          const keyBg = WeaveFeatures.camelotBackground(
                            track.keyIndex,
                            track.keyMode,
                            track.key,
                            track.keyColor
                          );
                          return h(
                            "div",
                            {
                              className: "weave-col-feat weave-col-key weave-find-key",
                              title: keyLabel || WeaveI18n.t("common.unknown"),
                            },
                            h(
                              "span",
                              {
                                className:
                                  "weave-key-circle" + (keyLabel ? "" : " is-empty"),
                                style: keyBg ? { background: keyBg } : undefined,
                              },
                              keyLabel || "—"
                            )
                          );
                        })(),
                        h(
                          "span",
                          { className: "weave-find-dur" },
                          WeaveApi.formatDuration(track.durationMs)
                        ),
                        h(
                          "button",
                          {
                            type: "button",
                            className: "weave-btn weave-btn-primary weave-btn-compact",
                            disabled: inPl,
                            onClick: () => onAddTrack?.(track),
                          },
                          inPl ? "In playlist" : WeaveI18n.t("results.add")
                        )
                      );
                    })
                  )
        )
      )
    )
  );
}
