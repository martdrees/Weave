//@ts-check

/** Phase 5 — MixMoose “Add Track”: Spotify-style catalog search. */
function MixAppAddTrackModal(props) {
  const react = Spicetify.React;
  const {
    open,
    playlistTracks,
    playingUri,
    isPlaying,
    onClose,
    onAddTrack,
    onPlay,
  } = props;

  const [query, setQuery] = react.useState("");
  const [results, setResults] = react.useState([]);
  const [loading, setLoading] = react.useState(false);
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
      setQuery("");
      setResults([]);
      setError(null);
      setLoading(false);
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

  async function runSearch(e) {
    e?.preventDefault?.();
    const q = String(query || "").trim();
    if (!q) {
      setError("Enter a search query");
      return;
    }
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    try {
      let list = await MixAppApi.searchTracks(q, { limit: 30 });
      if (gen !== genRef.current) return;
      if (list.length) {
        try {
          list = await MixAppFeatures.enrichTracks(list.slice());
        } catch (enrichErr) {
          console.warn("MixApp: add-track enrich failed", enrichErr);
        }
      }
      if (gen !== genRef.current) return;
      setResults(list);
      if (!list.length) setError("No tracks found");
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setResults([]);
      setError(err?.message || "Search failed");
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }

  if (!open) return null;

  // Match SearchResults / Arranger column widths.
  const gridTemplate = [
    "40px",
    "minmax(140px, 1fr)",
    "minmax(100px, 0.9fr)",
    "minmax(80px, 0.6fr)",
    "2.6rem",
    "2.4rem",
    "2.8rem",
    "2.8rem",
    "100px",
  ].join(" ");

  const tempoMetric = MixAppFeatures.METRICS.find((m) => m.id === "tempo");
  const energyMetric = MixAppFeatures.METRICS.find((m) => m.id === "energy");
  const tempoRange = MixAppFeatures.rangeForMetric(results, tempoMetric);
  const energyRange = MixAppFeatures.rangeForMetric(results, energyMetric);

  function cell(className, children, style) {
    return react.createElement("div", {
      className,
      style: style || undefined,
    }, children);
  }

  function coloredFeat(className, text, norm) {
    const bg = MixAppFeatures.relativeColor(norm);
    return cell(className, text, bg ? { background: bg } : undefined);
  }

  function playButton(track, index) {
    const active = !!(track.uri && track.uri === playingUri && isPlaying);
    const playLabel = active
      ? "Pause " + (track.name || "track")
      : "Play " + (track.name || "track");
    return react.createElement(
      "button",
      {
        type: "button",
        className: "mixapp-play-btn" + (active ? " is-playing" : ""),
        onClick: (ev) => {
          ev.stopPropagation();
          onPlay?.(track, index);
        },
        title: playLabel,
        "aria-label": playLabel,
      },
      react.createElement(
        "svg",
        {
          viewBox: "0 0 16 16",
          width: 14,
          height: 14,
          "aria-hidden": "true",
          focusable: "false",
        },
        active
          ? react.createElement("path", {
              fill: "currentColor",
              d: "M3.5 2h3v12h-3V2zm6 0h3v12h-3V2z",
            })
          : react.createElement("path", {
              fill: "currentColor",
              d: "M3 2.5v11l10-5.5L3 2.5z",
            })
      )
    );
  }

  function head() {
    return react.createElement(
      "div",
      {
        className: "mixapp-arranger-head mixapp-results-table-head",
        style: { gridTemplateColumns: gridTemplate },
      },
      cell("mixapp-col-num", "#"),
      cell("mixapp-col-title", "Title"),
      cell("mixapp-col-artist", "Artists"),
      cell("mixapp-col-album mixapp-results-optional", "Album"),
      cell("mixapp-col-feat mixapp-col-key", "Key"),
      cell("mixapp-col-feat mixapp-col-bpm", "BPM"),
      cell("mixapp-col-feat mixapp-col-energy mixapp-results-optional", "Energy"),
      cell("mixapp-col-dur mixapp-results-optional", "Time"),
      cell("mixapp-col-actions", "")
    );
  }

  function row(track, index) {
    const inPl = isInPlaylist(track);
    const bpmVal = MixAppFeatures.metricValue(track, tempoMetric);
    const energyVal = MixAppFeatures.metricValue(track, energyMetric);
    const bpmText =
      bpmVal != null ? MixAppFeatures.formatMetric(tempoMetric, bpmVal) : "—";
    const energyText =
      energyVal != null
        ? MixAppFeatures.formatMetric(energyMetric, energyVal)
        : "—";
    const keyBg = MixAppFeatures.camelotBackground(
      track.keyIndex,
      track.keyMode,
      track.key
    );

    return react.createElement(
      "div",
      {
        key: track.uid || track.uri || String(index),
        className:
          "mixapp-track-row mixapp-results-table-row" +
          (inPl ? " is-in-playlist" : ""),
        style: { gridTemplateColumns: gridTemplate },
      },
      cell("mixapp-col-num", String(index + 1)),
      cell(
        "mixapp-col-title",
        react.createElement(
          "div",
          { className: "mixapp-title-cell" },
          playButton(track, index),
          react.createElement(
            "button",
            {
              type: "button",
              className: "mixapp-linkish",
              onClick: () => onPlay?.(track, index),
              title: "Play",
            },
            track.name || "Unknown",
            track.explicit
              ? react.createElement(
                  "span",
                  { className: "mixapp-explicit-mark", title: "Explicit" },
                  " E"
                )
              : null
          )
        )
      ),
      cell("mixapp-col-artist", track.artists || "—"),
      cell("mixapp-col-album mixapp-results-optional", track.album || "—"),
      cell(
        "mixapp-col-feat mixapp-col-key",
        track.key || "—",
        keyBg ? { background: keyBg } : undefined
      ),
      coloredFeat(
        "mixapp-col-feat mixapp-col-bpm",
        bpmText,
        MixAppFeatures.relativeNorm(bpmVal, tempoRange?.min, tempoRange?.max)
      ),
      coloredFeat(
        "mixapp-col-feat mixapp-col-energy mixapp-results-optional",
        energyText,
        MixAppFeatures.relativeNorm(
          energyVal,
          energyRange?.min,
          energyRange?.max
        )
      ),
      cell(
        "mixapp-col-dur mixapp-results-optional",
        MixAppApi.formatDuration(track.durationMs)
      ),
      cell(
        "mixapp-col-actions mixapp-results-actions",
        react.createElement(
          "button",
          {
            type: "button",
            className: "mixapp-btn mixapp-btn-primary",
            disabled: inPl,
            title: inPl ? "Already in playlist" : "Add to playlist",
            onClick: () => onAddTrack?.(track),
          },
          inPl ? "In playlist" : "Add"
        )
      )
    );
  }

  return react.createElement(
    "div",
    {
      className: "mixapp-results-overlay",
      role: "presentation",
      onClick: (ev) => {
        if (ev.target === ev.currentTarget) onClose?.();
      },
    },
    react.createElement(
      "div",
      {
        className: "mixapp-results-modal mixapp-find-modal mixapp-add-track-modal",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Add track",
      },
      react.createElement(
        "div",
        { className: "mixapp-recommend-header" },
        react.createElement(
          "div",
          { className: "mixapp-search-panel-title-row" },
          react.createElement("h2", null, "Add Track"),
          results.length
            ? react.createElement(
                "span",
                { className: "mixapp-recommend-meta" },
                String(results.length) + " tracks"
              )
            : null
        ),
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
        "form",
        {
          className: "mixapp-find-search-bar",
          onSubmit: runSearch,
        },
        react.createElement("input", {
          type: "search",
          className: "mixapp-find-input",
          placeholder: "Song, artist, or album…",
          value: query,
          autoFocus: true,
          onChange: (ev) => setQuery(ev.target.value),
        }),
        react.createElement(
          "button",
          {
            type: "submit",
            className: "mixapp-btn mixapp-btn-primary",
            disabled: loading || !String(query || "").trim(),
          },
          loading ? "Searching…" : "Search"
        )
      ),
      error
        ? react.createElement("div", { className: "mixapp-find-error" }, error)
        : null,
      react.createElement(
        "div",
        { className: "mixapp-search-results-body" },
        loading
          ? react.createElement(
              "div",
              {
                className: "mixapp-arranger-empty mixapp-search-waiting",
                role: "status",
                "aria-live": "polite",
              },
              react.createElement("div", {
                className: "mixapp-spinner",
                "aria-hidden": "true",
              }),
              react.createElement(
                "p",
                { className: "mixapp-search-waiting-label" },
                "Searching…"
              )
            )
          : !results.length
            ? react.createElement(
                "div",
                { className: "mixapp-arranger-empty" },
                "Search Spotify’s catalog and add tracks to your playlist."
              )
            : react.createElement(
                "div",
                { className: "mixapp-results-table" },
                head(),
                results.map((track, index) => row(track, index))
              )
      )
    )
  );
}
