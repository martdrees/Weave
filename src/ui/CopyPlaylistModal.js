//@ts-check

/** Phase 5 — MixMoose “Copy from Playlist”: import tracks from another list. */
function MixAppCopyPlaylistModal(props) {
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
    () => MixAppPlaylistOps.buildExistingIndex(playlistTracks),
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
    return MixAppPlaylistOps.isInIndex(existingIndex, track);
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
      const hits = await MixAppApi.searchPlaylists(q, { limit: 20 });
      if (gen !== genRef.current) return;
      setSearchHits(hits.filter((p) => p.uri !== currentPlaylistUri));
      if (!hits.length) setError(MixAppI18n.t("picker.empty"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setSearchHits([]);
      setError(err?.message || MixAppI18n.t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setSearchLoading(false);
    }
  }

  async function loadSource(pl) {
    if (!pl?.uri) return;
    const gen = ++genRef.current;
    setSelectedUri(pl.uri);
    setSourceName(pl.name || MixAppI18n.t("picker.playlist"));
    setSourceTracks([]);
    setSelected(new Set());
    setTracksLoading(true);
    setError(null);
    try {
      let items = await MixAppApi.getPlaylistTracks(pl.uri);
      if (gen !== genRef.current) return;
      if (items.length) {
        try {
          items = await MixAppFeatures.enrichTracks(items.slice());
        } catch (enrichErr) {
          console.warn("Weave: copy-playlist enrich failed", enrichErr);
        }
      }
      if (gen !== genRef.current) return;
      setSourceTracks(items);
      if (!items.length) setError(MixAppI18n.t("results.empty"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setSourceTracks([]);
      setError(err?.message || MixAppI18n.t("notify.failedPlaylist"));
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
      MixAppApi.notify(MixAppI18n.t("copy.noSelection"), true);
      return;
    }
    onAddTracks?.(batch);
    setSelected(new Set());
  }

  function addAllNew() {
    const batch = sourceTracks.filter((t) => t?.uri && !isInPlaylist(t));
    if (!batch.length) {
      MixAppApi.notify(MixAppI18n.t("copy.allExist"), true);
      return;
    }
    onAddTracks?.(batch);
    setSelected(new Set());
  }

  const playlistList = mode === "library" ? libraryOptions : searchHits;

  return h(
    MixAppModal,
    {
      open,
      title: MixAppI18n.t("copy.title"),
      onClose,
      ariaLabel: MixAppI18n.t("copy.title"),
      className: "mixapp-find-modal mixapp-copy-modal",
    },
    h(
      "div",
      { className: "mixapp-copy-layout" },
      h(
        "aside",
        { className: "mixapp-copy-sidebar" },
        h(
          "div",
          { className: "mixapp-copy-tabs" },
          h(
            "button",
            {
              type: "button",
              className:
                "mixapp-btn mixapp-btn-ghost" +
                (mode === "library" ? " mixapp-btn-active" : ""),
              onClick: () => setMode("library"),
            },
            "Your library"
          ),
          h(
            "button",
            {
              type: "button",
              className:
                "mixapp-btn mixapp-btn-ghost" +
                (mode === "search" ? " mixapp-btn-active" : ""),
              onClick: () => setMode("search"),
            },
            MixAppI18n.t("common.search")
          )
        ),
        mode === "search"
          ? h(
              "form",
              {
                className: "mixapp-find-search-bar mixapp-find-search-bar-stack",
                onSubmit: runPlaylistSearch,
              },
              h("input", {
                type: "search",
                className: "mixapp-find-input",
                placeholder: MixAppI18n.t("copy.placeholder"),
                value: query,
                onChange: (e) => setQuery(e.target.value),
              }),
              h(
                "button",
                {
                  type: "submit",
                  className: "mixapp-btn mixapp-btn-primary",
                  disabled: searchLoading || !String(query || "").trim(),
                },
                searchLoading ? "…" : "Search"
              )
            )
          : null,
        h(
          "div",
          { className: "mixapp-copy-playlist-list" },
          !playlistList.length
            ? h(
                "div",
                { className: "mixapp-recommend-meta" },
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
                      "mixapp-copy-playlist-item" +
                      (selectedUri === pl.uri ? " is-active" : ""),
                    onClick: () => loadSource(pl),
                  },
                  h("span", { className: "mixapp-copy-playlist-name" }, pl.name),
                  h(
                    "span",
                    { className: "mixapp-recommend-meta" },
                    pl.totalLength != null
                      ? MixAppI18n.t("picker.tracks", { count: pl.totalLength })
                      : pl.ownerName || ""
                  )
                )
              )
        )
      ),
      h(
        "section",
        { className: "mixapp-copy-main" },
        h(
          "div",
          { className: "mixapp-copy-main-head" },
          h(
            "div",
            { className: "mixapp-search-panel-title-row" },
            h("h3", null, sourceName || MixAppI18n.t("picker.select")),
            sourceTracks.length
              ? h(
                  "span",
                  { className: "mixapp-recommend-meta" },
                  sourceTracks.length + " tracks · " + selected.size + " selected"
                )
              : null
          ),
          sourceTracks.length
            ? h(
                "div",
                { className: "mixapp-copy-actions" },
                h(
                  "button",
                  {
                    type: "button",
                    className: "mixapp-btn mixapp-btn-ghost",
                    onClick: selectAddable,
                  },
                  "Select new"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "mixapp-btn mixapp-btn-ghost",
                    onClick: clearSelection,
                    disabled: !selected.size,
                  },
                  "Clear"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "mixapp-btn",
                    onClick: addSelected,
                    disabled: !selected.size,
                  },
                  MixAppI18n.t("results.addSelected")
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "mixapp-btn mixapp-btn-primary",
                    onClick: addAllNew,
                  },
                  "Add all new"
                )
              )
            : null
        ),
        error ? h("div", { className: "mixapp-find-error" }, error) : null,
        h(
          "div",
          { className: "mixapp-search-results-body" },
          tracksLoading
            ? h(
                "div",
                { className: "mixapp-arranger-empty mixapp-search-waiting" },
                h("div", {
                  className: "mixapp-spinner",
                  "aria-hidden": "true",
                }),
                h("p", { className: "mixapp-search-waiting-label" }, MixAppI18n.t("picker.loading"))
              )
            : !selectedUri
              ? h(
                  "div",
                  { className: "mixapp-arranger-empty" },
                  "Pick a playlist on the left to browse its tracks."
                )
              : !sourceTracks.length
                ? h("div", { className: "mixapp-arranger-empty" }, "No tracks to show.")
                : h(
                    "div",
                    { className: "mixapp-find-list" },
                    sourceTracks.map((track, index) => {
                      const inPl = isInPlaylist(track);
                      const checked = !!(track.uri && selected.has(track.uri));
                      return h(
                        "div",
                        {
                          key: track.uid || track.uri || index,
                          className:
                            "mixapp-find-row" + (inPl ? " is-in-playlist" : ""),
                        },
                        h("input", {
                          type: "checkbox",
                          checked: checked,
                          disabled: inPl || !track.uri,
                          onChange: () => toggleSelect(track.uri),
                          title: inPl
                            ? MixAppI18n.t("notify.alreadyInPlaylist")
                            : MixAppI18n.t("results.add"),
                        }),
                        h(MixAppPlayButton, {
                          track,
                          playingUri,
                          isPlaying,
                          onPlay,
                          index,
                        }),
                        h(
                          "div",
                          { className: "mixapp-find-meta" },
                          h(
                            "div",
                            { className: "mixapp-find-title" },
                            track.name || MixAppI18n.t("common.unknown")
                          ),
                          h(
                            "div",
                            { className: "mixapp-find-sub" },
                            [track.artists, track.album].filter(Boolean).join(" · ")
                          )
                        ),
                        (() => {
                          const keyBg = MixAppFeatures.camelotBackground(
                            track.keyIndex,
                            track.keyMode,
                            track.key
                          );
                          return h(
                            "div",
                            {
                              className:
                                "mixapp-col-feat mixapp-col-key mixapp-find-key",
                              title: track.key || MixAppI18n.t("common.unknown"),
                            },
                            h(
                              "span",
                              {
                                className:
                                  "mixapp-key-circle" + (track.key ? "" : " is-empty"),
                                style: keyBg ? { background: keyBg } : undefined,
                              },
                              track.key || "—"
                            )
                          );
                        })(),
                        h(
                          "span",
                          { className: "mixapp-find-dur" },
                          MixAppApi.formatDuration(track.durationMs)
                        ),
                        h(
                          "button",
                          {
                            type: "button",
                            className:
                              "mixapp-btn mixapp-btn-primary mixapp-btn-compact",
                            disabled: inPl,
                            onClick: () => onAddTrack?.(track),
                          },
                          inPl ? "In playlist" : MixAppI18n.t("results.add")
                        )
                      );
                    })
                  )
        )
      )
    )
  );
}
