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

  const existingUris = react.useMemo(() => {
    const s = new Set();
    for (const t of playlistTracks || []) {
      if (t?.uri) s.add(t.uri);
      const id = t?.id || MixAppRecommend.trackIdFromUri?.(t?.uri);
      if (id) s.add("id:" + id);
      const fp = MixAppRecommend.trackFingerprint?.(t);
      if (fp) s.add("fp:" + fp);
    }
    return s;
  }, [playlistTracks]);

  react.useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
    if (!track) return false;
    if (track.uri && existingUris.has(track.uri)) return true;
    const id = track.id || MixAppRecommend.trackIdFromUri?.(track.uri);
    if (id && existingUris.has("id:" + id)) return true;
    const fp = MixAppRecommend.trackFingerprint?.(track);
    if (fp && existingUris.has("fp:" + fp)) return true;
    return false;
  }

  const libraryOptions = (libraryPlaylists || []).filter(
    (p) => p?.uri && p.uri !== currentPlaylistUri
  );

  async function runPlaylistSearch(e) {
    e?.preventDefault?.();
    const q = String(query || "").trim();
    if (!q) {
      setError("Enter a playlist name");
      return;
    }
    const gen = ++genRef.current;
    setSearchLoading(true);
    setError(null);
    try {
      const hits = await MixAppApi.searchPlaylists(q, { limit: 20 });
      if (gen !== genRef.current) return;
      setSearchHits(hits.filter((p) => p.uri !== currentPlaylistUri));
      if (!hits.length) setError("No playlists found");
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setSearchHits([]);
      setError(err?.message || "Playlist search failed");
    } finally {
      if (gen === genRef.current) setSearchLoading(false);
    }
  }

  async function loadSource(pl) {
    if (!pl?.uri) return;
    const gen = ++genRef.current;
    setSelectedUri(pl.uri);
    setSourceName(pl.name || "Playlist");
    setSourceTracks([]);
    setSelected(new Set());
    setTracksLoading(true);
    setError(null);
    try {
      const items = await MixAppApi.getPlaylistTracks(pl.uri);
      if (gen !== genRef.current) return;
      setSourceTracks(items);
      if (!items.length) setError("That playlist has no tracks");
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setSourceTracks([]);
      setError(err?.message || "Failed to load playlist");
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
      MixAppApi.notify("No new tracks selected", true);
      return;
    }
    onAddTracks?.(batch);
    setSelected(new Set());
  }

  function addAllNew() {
    const batch = sourceTracks.filter((t) => t?.uri && !isInPlaylist(t));
    if (!batch.length) {
      MixAppApi.notify("All tracks are already in your playlist", true);
      return;
    }
    onAddTracks?.(batch);
    setSelected(new Set());
  }

  if (!open) return null;

  const playlistList =
    mode === "library" ? libraryOptions : searchHits;

  return react.createElement(
    "div",
    {
      className: "mixapp-results-overlay",
      role: "presentation",
      onClick: (e) => {
        if (e.target === e.currentTarget) onClose?.();
      },
    },
    react.createElement(
      "div",
      {
        className: "mixapp-results-modal mixapp-find-modal mixapp-copy-modal",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Copy from playlist",
      },
      react.createElement(
        "div",
        { className: "mixapp-recommend-header" },
        react.createElement("h2", null, "Copy from Playlist"),
        react.createElement(
          "button",
          {
            type: "button",
            className: "mixapp-icon-btn",
            onClick: onClose,
            title: "Close",
            "aria-label": "Close",
          },
          "✕"
        )
      ),
      react.createElement(
        "div",
        { className: "mixapp-copy-layout" },
        react.createElement(
          "aside",
          { className: "mixapp-copy-sidebar" },
          react.createElement(
            "div",
            { className: "mixapp-copy-tabs" },
            react.createElement(
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
            react.createElement(
              "button",
              {
                type: "button",
                className:
                  "mixapp-btn mixapp-btn-ghost" +
                  (mode === "search" ? " mixapp-btn-active" : ""),
                onClick: () => setMode("search"),
              },
              "Search"
            )
          ),
          mode === "search"
            ? react.createElement(
                "form",
                {
                  className: "mixapp-find-search-bar mixapp-find-search-bar-stack",
                  onSubmit: runPlaylistSearch,
                },
                react.createElement("input", {
                  type: "search",
                  className: "mixapp-find-input",
                  placeholder: "Playlist name…",
                  value: query,
                  onChange: (e) => setQuery(e.target.value),
                }),
                react.createElement(
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
          react.createElement(
            "div",
            { className: "mixapp-copy-playlist-list" },
            !playlistList.length
              ? react.createElement(
                  "div",
                  { className: "mixapp-recommend-meta" },
                  mode === "library"
                    ? "No other playlists in your library."
                    : "Search for a playlist to copy from."
                )
              : playlistList.map((pl) =>
                  react.createElement(
                    "button",
                    {
                      key: pl.uri,
                      type: "button",
                      className:
                        "mixapp-copy-playlist-item" +
                        (selectedUri === pl.uri ? " is-active" : ""),
                      onClick: () => loadSource(pl),
                    },
                    react.createElement(
                      "span",
                      { className: "mixapp-copy-playlist-name" },
                      pl.name
                    ),
                    react.createElement(
                      "span",
                      { className: "mixapp-recommend-meta" },
                      pl.totalLength != null
                        ? pl.totalLength + " tracks"
                        : pl.ownerName || ""
                    )
                  )
                )
          )
        ),
        react.createElement(
          "section",
          { className: "mixapp-copy-main" },
          react.createElement(
            "div",
            { className: "mixapp-copy-main-head" },
            react.createElement(
              "div",
              { className: "mixapp-search-panel-title-row" },
              react.createElement(
                "h3",
                null,
                sourceName || "Select a playlist"
              ),
              sourceTracks.length
                ? react.createElement(
                    "span",
                    { className: "mixapp-recommend-meta" },
                    sourceTracks.length + " tracks · " + selected.size + " selected"
                  )
                : null
            ),
            sourceTracks.length
              ? react.createElement(
                  "div",
                  { className: "mixapp-copy-actions" },
                  react.createElement(
                    "button",
                    {
                      type: "button",
                      className: "mixapp-btn mixapp-btn-ghost",
                      onClick: selectAddable,
                    },
                    "Select new"
                  ),
                  react.createElement(
                    "button",
                    {
                      type: "button",
                      className: "mixapp-btn mixapp-btn-ghost",
                      onClick: clearSelection,
                      disabled: !selected.size,
                    },
                    "Clear"
                  ),
                  react.createElement(
                    "button",
                    {
                      type: "button",
                      className: "mixapp-btn",
                      onClick: addSelected,
                      disabled: !selected.size,
                    },
                    "Add selected"
                  ),
                  react.createElement(
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
          error
            ? react.createElement("div", { className: "mixapp-find-error" }, error)
            : null,
          react.createElement(
            "div",
            { className: "mixapp-search-results-body" },
            tracksLoading
              ? react.createElement(
                  "div",
                  { className: "mixapp-arranger-empty mixapp-search-waiting" },
                  react.createElement("div", {
                    className: "mixapp-spinner",
                    "aria-hidden": "true",
                  }),
                  react.createElement(
                    "p",
                    { className: "mixapp-search-waiting-label" },
                    "Loading tracks…"
                  )
                )
              : !selectedUri
                ? react.createElement(
                    "div",
                    { className: "mixapp-arranger-empty" },
                    "Pick a playlist on the left to browse its tracks."
                  )
                : !sourceTracks.length
                  ? react.createElement(
                      "div",
                      { className: "mixapp-arranger-empty" },
                      "No tracks to show."
                    )
                  : react.createElement(
                      "div",
                      { className: "mixapp-find-list" },
                      sourceTracks.map((track, index) => {
                        const inPl = isInPlaylist(track);
                        const checked = !!(track.uri && selected.has(track.uri));
                        const active = !!(
                          track.uri &&
                          track.uri === playingUri &&
                          isPlaying
                        );
                        return react.createElement(
                          "div",
                          {
                            key: track.uid || track.uri || index,
                            className:
                              "mixapp-find-row" + (inPl ? " is-in-playlist" : ""),
                          },
                          react.createElement("input", {
                            type: "checkbox",
                            checked: checked,
                            disabled: inPl || !track.uri,
                            onChange: () => toggleSelect(track.uri),
                            title: inPl
                              ? "Already in playlist"
                              : "Select to add",
                          }),
                          react.createElement(
                            "button",
                            {
                              type: "button",
                              className:
                                "mixapp-play-btn" + (active ? " is-playing" : ""),
                              onClick: () => onPlay?.(track, index),
                              title: active ? "Pause" : "Play",
                            },
                            active ? "❚❚" : "▶"
                          ),
                          react.createElement(
                            "div",
                            { className: "mixapp-find-meta" },
                            react.createElement(
                              "div",
                              { className: "mixapp-find-title" },
                              track.name || "Unknown"
                            ),
                            react.createElement(
                              "div",
                              { className: "mixapp-find-sub" },
                              [track.artists, track.album]
                                .filter(Boolean)
                                .join(" · ")
                            )
                          ),
                          react.createElement(
                            "span",
                            { className: "mixapp-find-dur" },
                            MixAppApi.formatDuration(track.durationMs)
                          ),
                          react.createElement(
                            "button",
                            {
                              type: "button",
                              className:
                                "mixapp-btn mixapp-btn-primary mixapp-btn-compact",
                              disabled: inPl,
                              onClick: () => onAddTrack?.(track),
                            },
                            inPl ? "In playlist" : "Add"
                          )
                        );
                      })
                    )
          )
        )
      )
    )
  );
}
