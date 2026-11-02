//@ts-check
/**
 * Shared catalog / results track table (R2.1).
 * Visual language matches Arranger (play btn, key circle, feat pills, title meta).
 * Arranger itself stays separate — playlist is the gold standard.
 * Column visibility: WeaveResultsColumnConfig (not playlist WeaveColumnConfig).
 * Inventory: docs/COMPONENTS.md — Track row / table.
 */

/** @param {{ track: object, playingUri?: string|null, isPlaying?: boolean, onPlay?: Function, index?: number }} props */
function WeavePlayButton(props) {
  const react = Spicetify.React;
  const { track, playingUri, isPlaying, onPlay, index } = props || {};
  const active = !!(track?.uri && track.uri === playingUri && isPlaying);
  const playLabel = active
    ? "Pause " + (track?.name || "track")
    : "Play " + (track?.name || "track");
  return h(
    "button",
    {
      type: "button",
      className: "weave-play-btn" + (active ? " is-playing" : ""),
      onClick: (e) => {
        e.stopPropagation();
        onPlay?.(track, index);
      },
      title: playLabel,
      "aria-label": playLabel,
    },
    h(
      "svg",
      {
        viewBox: "0 0 16 16",
        width: 14,
        height: 14,
        "aria-hidden": "true",
        focusable: "false",
      },
      active
        ? h("path", {
            fill: "currentColor",
            d: "M3.5 2h3v12h-3V2zm6 0h3v12h-3V2z",
          })
        : h("path", {
            fill: "currentColor",
            d: "M3 2.5v11l10-5.5L3 2.5z",
          })
    )
  );
}

/** Feature columns available in results tables (all WeaveFeatures metrics + Key). */
const WEAVE_TRACK_TABLE_FEATURE_IDS = [
  "BPM",
  "KEY",
  "ENERGY",
  "DANCEABILITY",
  "VALENCE",
  "ACOUSTICNESS",
  "INSTRUMENTALNESS",
  "SPEECHINESS",
  "LIVENESS",
  "LOUDNESS",
];

/**
 * Playlist-style track table for results / catalog UIs.
 *
 * @param {{
 *   tracks: object[],
 *   playingUri?: string|null,
 *   isPlaying?: boolean,
 *   onPlay?: (track: object, index: number) => void,
 *   onAddTrack?: (track: object) => void,
 *   onHideTrack?: (track: object) => void,
 *   disabledReason?: (track: object) => string|null|undefined,
 *   rowClassName?: string | ((track: object, index: number) => string),
 *   loading?: boolean,
 *   loadingLabel?: string,
 *   emptyLabel?: string,
 *   className?: string,
 *   showAlbumInSubtitle?: boolean,
 * }} props
 */
function WeaveTrackTable(props) {
  const react = Spicetify.React;
  const {
    tracks,
    playingUri,
    isPlaying,
    onPlay,
    onAddTrack,
    onHideTrack,
    disabledReason,
    rowClassName,
    loading,
    loadingLabel,
    emptyLabel,
    className,
    showAlbumInSubtitle = true,
  } = props || {};

  const [visibility, setVisibility] = react.useState(() =>
    WeaveResultsColumnConfig.getVisibility()
  );
  const [menu, setMenu] = react.useState(null);
  const menuRef = react.useRef(null);

  react.useEffect(() => {
    setVisibility(WeaveResultsColumnConfig.getVisibility());
  }, []);

  react.useEffect(() => {
    if (!menu) return undefined;
    function onDoc(e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setMenu(null);
    }
    function onKey(e) {
      if (e.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const useLayout = react.useLayoutEffect || react.useEffect;
  useLayout(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    let x = menu.x;
    let y = menu.y;
    const pad = 8;
    if (x + rect.width > window.innerWidth - pad) {
      x = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (y + rect.height > window.innerHeight - pad) {
      y = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    if (x !== menu.x || y !== menu.y) setMenu({ x, y });
  }, [menu]);

  const list = Array.isArray(tracks) ? tracks : [];
  const show = (id) => WeaveResultsColumnConfig.isVisible(visibility, id);
  const toggleable = WeaveResultsColumnConfig.COLUMNS.filter((c) => !c.always);
  const featureCols = WeaveResultsColumnConfig.COLUMNS.filter((c) =>
    WEAVE_TRACK_TABLE_FEATURE_IDS.includes(c.id)
  );

  const gridTemplate = [
    show("INDEX") ? "36px" : null,
    show("TITLE_AND_ARTIST") ? "minmax(160px, 1.2fr)" : null,
    ...featureCols.map((c) =>
      show(c.id) ? WeaveResultsColumnConfig.featureWidth(c) : null
    ),
    show("DURATION") ? "52px" : null,
    show("ACTIONS")
      ? onHideTrack
        ? "minmax(100px, max-content)"
        : "minmax(84px, max-content)"
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const metricRanges = {};
  for (const col of featureCols) {
    if (!col.metricId || !show(col.id)) continue;
    const metric = WeaveFeatures.METRICS.find((m) => m.id === col.metricId);
    if (metric) {
      metricRanges[col.metricId] = WeaveFeatures.rangeForMetric(list, metric);
    }
  }

  function cell(classNameCell, children, style) {
    return h("div", { className: classNameCell, style: style || undefined }, children);
  }

  function openColumnMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  function handleToggleColumn(columnId) {
    const next = WeaveResultsColumnConfig.toggle(columnId);
    setVisibility({ ...next });
  }

  /** Feature cells — same rendering as Arranger (key circle / feat pills). */
  function featureCell(track, col) {
    if (col.id === "KEY") {
      const label = WeaveFeatures.formatDisplayKey(track);
      const bg = WeaveFeatures.camelotBackground(
        track.keyIndex,
        track.keyMode,
        track.key,
        track.keyColor
      );
      return cell(
        "weave-col-feat weave-col-key",
        h(
          "span",
          {
            className: "weave-key-circle" + (label ? "" : " is-empty"),
            style: bg ? { background: bg } : undefined,
            title: label || undefined,
          },
          label || "—"
        )
      );
    }
    if (col.id === "BPM") {
      const text =
        track.bpm != null && track.bpm !== ""
          ? String(track.bpm)
          : track.tempo != null
            ? String(Math.round(Number(track.tempo)))
            : "—";
      return cell(
        "weave-col-feat weave-col-bpm",
        h(
          "span",
          {
            className: "weave-feat-pill",
            style: { background: WeaveFeatures.featureTint("tempo") },
          },
          text
        )
      );
    }
    const metricId = col.metricId;
    const metric = WeaveFeatures.METRICS.find((m) => m.id === metricId);
    const v = WeaveFeatures.metricValue(track, metric);
    const text = WeaveFeatures.formatMetric(metric, v);
    const bg = WeaveFeatures.featureTint(metricId || col.id);
    return cell(
      "weave-col-feat weave-col-" + (metricId || col.id.toLowerCase()),
      h(
        "span",
        {
          className: "weave-feat-pill",
          style: { background: bg },
        },
        text
      )
    );
  }

  function titleMeta(track) {
    const subParts = [];
    if (track.artists) subParts.push(track.artists);
    if (showAlbumInSubtitle && track.album) subParts.push(track.album);
    return h(
      "div",
      { className: "weave-track-meta" },
      h(
        "button",
        {
          type: "button",
          className: "weave-track-meta-title",
          onClick: (e) => {
            e.stopPropagation();
            onPlay?.(track, list.indexOf(track));
          },
          title: "Play",
        },
        track.name || "Unknown",
        track.explicit
          ? h("span", { className: "weave-explicit-mark", title: "Explicit" }, " E")
          : null
      ),
      subParts.length
        ? h(
            "div",
            { className: "weave-track-meta-sub", title: subParts.join(" · ") },
            subParts.join(" · ")
          )
        : null
    );
  }

  function head() {
    const cells = [];
    if (show("INDEX")) cells.push(cell("weave-col-num", "#"));
    if (show("TITLE_AND_ARTIST")) cells.push(cell("weave-col-title", "Track"));
    for (const col of featureCols) {
      if (show(col.id)) {
        cells.push(cell("weave-col-feat weave-col-feat-head", col.label));
      }
    }
    if (show("DURATION")) cells.push(cell("weave-col-dur", "Time"));
    if (show("ACTIONS")) cells.push(cell("weave-col-actions", ""));
    return h(
      "div",
      {
        className: "weave-arranger-head weave-results-table-head",
        style: { gridTemplateColumns: gridTemplate },
        onContextMenu: openColumnMenu,
        title: "Right-click to show or hide columns",
        role: "presentation",
      },
      ...cells
    );
  }

  function actionCells(track) {
    const reason = disabledReason?.(track) || null;
    const disabled = !!reason;
    const buttons = [];
    if (onAddTrack) {
      buttons.push(
        h(
          "button",
          {
            key: "add",
            type: "button",
            className: "weave-btn weave-btn-primary",
            disabled,
            title: reason || "Add to playlist",
            onClick: () => onAddTrack(track),
          },
          disabled ? reason || "In playlist" : "Add"
        )
      );
    }
    if (onHideTrack) {
      buttons.push(
        h(
          "button",
          {
            key: "hide",
            type: "button",
            className: "weave-btn weave-btn-ghost",
            onClick: () => onHideTrack(track),
            title: "Don't show again this session",
          },
          "Hide"
        )
      );
    }
    return cell("weave-col-actions weave-results-actions", buttons);
  }

  function row(track, index) {
    const extra =
      typeof rowClassName === "function"
        ? rowClassName(track, index)
        : rowClassName || "";
    const isCurrent = !!(track.uri && track.uri === playingUri);
    const cells = [];
    if (show("INDEX")) cells.push(cell("weave-col-num", String(index + 1)));
    if (show("TITLE_AND_ARTIST")) {
      cells.push(
        cell(
          "weave-col-title",
          h(
            "div",
            { className: "weave-title-cell" },
            h(WeavePlayButton, {
              track,
              playingUri,
              isPlaying,
              onPlay,
              index,
            }),
            titleMeta(track)
          )
        )
      );
    }
    for (const col of featureCols) {
      if (show(col.id)) cells.push(featureCell(track, col));
    }
    if (show("DURATION")) {
      cells.push(
        cell(
          "weave-col-dur" + (isCurrent ? " is-current" : ""),
          WeaveApi.formatDuration(track.durationMs)
        )
      );
    }
    if (show("ACTIONS")) cells.push(actionCells(track));

    return h(
      "div",
      {
        key: track.uid || track.uri || String(index),
        className:
          "weave-track-row weave-results-table-row" + (extra ? " " + extra : ""),
        style: { gridTemplateColumns: gridTemplate },
        onContextMenu: openColumnMenu,
      },
      ...cells
    );
  }

  const columnMenu = menu
    ? h(
        "div",
        {
          ref: menuRef,
          className: "weave-column-menu",
          style: { left: menu.x + "px", top: menu.y + "px" },
          role: "menu",
        },
        h("div", { className: "weave-column-menu-title" }, "Columns"),
        toggleable.map((col) =>
          h(
            "label",
            {
              key: col.id,
              className: "weave-column-menu-item",
              role: "menuitemcheckbox",
              "aria-checked": show(col.id),
              onMouseDown: (e) => e.stopPropagation(),
            },
            h("input", {
              type: "checkbox",
              checked: show(col.id),
              onMouseDown: (e) => e.stopPropagation(),
              onClick: (e) => e.stopPropagation(),
              onChange: (e) => {
                e.stopPropagation();
                handleToggleColumn(col.id);
              },
            }),
            h("span", null, col.label)
          )
        )
      )
    : null;

  const menuPortal =
    columnMenu && Spicetify.ReactDOM?.createPortal
      ? Spicetify.ReactDOM.createPortal(columnMenu, document.body)
      : columnMenu;

  if (loading) {
    return h(
      "div",
      {
        className: "weave-arranger-empty weave-search-waiting",
        role: "status",
        "aria-live": "polite",
      },
      h("div", {
        className: "weave-spinner",
        "aria-hidden": "true",
      }),
      h("p", { className: "weave-search-waiting-label" }, loadingLabel || "Loading…")
    );
  }

  if (!list.length) {
    return h("div", { className: "weave-arranger-empty" }, emptyLabel || "No tracks.");
  }

  return h(
    "div",
    { className: className || "weave-results-table" },
    head(),
    list.map((track, index) => row(track, index)),
    menuPortal
  );
}
