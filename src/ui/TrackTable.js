//@ts-check
/**
 * Shared catalog / results track table (R2.1).
 * Visual language matches Arranger (play btn, key circle, feat pills, title meta).
 * Arranger itself stays separate — playlist is the gold standard.
 * Inventory: docs/COMPONENTS.md — Track row / table.
 */

/** @param {{ track: object, playingUri?: string|null, isPlaying?: boolean, onPlay?: Function, index?: number }} props */
function MixAppPlayButton(props) {
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
      className: "mixapp-play-btn" + (active ? " is-playing" : ""),
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

/**
 * Fixed column set for search / add-track tables (Arranger-aligned widths).
 * @type {{ id: string, label: string, width: string, metricId?: string }[]}
 */
const MIXAPP_TRACK_TABLE_FEATURE_COLS = [
  { id: "KEY", label: "Key", width: "2.4rem" },
  { id: "BPM", label: "BPM", width: "2.6rem" },
  { id: "ENERGY", label: "Energy", width: "3.5rem", metricId: "energy" },
  { id: "DANCEABILITY", label: "Dance", width: "3.25rem", metricId: "danceability" },
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
function MixAppTrackTable(props) {
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

  const list = Array.isArray(tracks) ? tracks : [];
  const featureCols = MIXAPP_TRACK_TABLE_FEATURE_COLS;

  const gridTemplate = [
    "36px",
    "minmax(140px, 1fr)",
    ...featureCols.map((c) => c.width),
    "52px",
    onHideTrack ? "minmax(100px, max-content)" : "minmax(84px, max-content)",
  ].join(" ");

  const metricRanges = {};
  for (const col of featureCols) {
    if (!col.metricId) continue;
    const metric = MixAppFeatures.METRICS.find((m) => m.id === col.metricId);
    if (metric) {
      metricRanges[col.metricId] = MixAppFeatures.rangeForMetric(list, metric);
    }
  }

  function cell(classNameCell, children, style) {
    return h("div", { className: classNameCell, style: style || undefined }, children);
  }

  /** Feature cells — same rendering as Arranger (key circle / feat pills). */
  function featureCell(track, col) {
    if (col.id === "KEY") {
      const bg = MixAppFeatures.camelotBackground(
        track.keyIndex,
        track.keyMode,
        track.key
      );
      return cell(
        "mixapp-col-feat mixapp-col-key",
        h(
          "span",
          {
            className: "mixapp-key-circle" + (track.key ? "" : " is-empty"),
            style: bg ? { background: bg } : undefined,
          },
          track.key || "—"
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
        "mixapp-col-feat mixapp-col-bpm",
        h("span", { className: "mixapp-feat-pill" }, text)
      );
    }
    const metricId = col.metricId;
    const metric = MixAppFeatures.METRICS.find((m) => m.id === metricId);
    const range = metricRanges[metricId];
    const v = MixAppFeatures.metricValue(track, metric);
    const text = MixAppFeatures.formatMetric(metric, v);
    const norm = MixAppFeatures.relativeNorm(v, range?.min, range?.max);
    const bg = MixAppFeatures.relativeColor(norm);
    return cell(
      "mixapp-col-feat mixapp-col-" + (metricId || col.id.toLowerCase()),
      h(
        "span",
        {
          className: "mixapp-feat-pill",
          style: bg ? { background: bg } : undefined,
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
      { className: "mixapp-track-meta" },
      h(
        "button",
        {
          type: "button",
          className: "mixapp-track-meta-title",
          onClick: (e) => {
            e.stopPropagation();
            onPlay?.(track, list.indexOf(track));
          },
          title: "Play",
        },
        track.name || "Unknown",
        track.explicit
          ? h("span", { className: "mixapp-explicit-mark", title: "Explicit" }, " E")
          : null
      ),
      subParts.length
        ? h(
            "div",
            { className: "mixapp-track-meta-sub", title: subParts.join(" · ") },
            subParts.join(" · ")
          )
        : null
    );
  }

  function head() {
    return h(
      "div",
      {
        className: "mixapp-arranger-head mixapp-results-table-head",
        style: { gridTemplateColumns: gridTemplate },
      },
      cell("mixapp-col-num", "#"),
      cell("mixapp-col-title", "Track"),
      ...featureCols.map((col) =>
        cell("mixapp-col-feat mixapp-col-feat-head", col.label)
      ),
      cell("mixapp-col-dur", "Time"),
      cell("mixapp-col-actions", "")
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
            className: "mixapp-btn mixapp-btn-primary",
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
            className: "mixapp-btn mixapp-btn-ghost",
            onClick: () => onHideTrack(track),
            title: "Don't show again this session",
          },
          "Hide"
        )
      );
    }
    return cell("mixapp-col-actions mixapp-results-actions", buttons);
  }

  function row(track, index) {
    const extra =
      typeof rowClassName === "function"
        ? rowClassName(track, index)
        : rowClassName || "";
    const isCurrent = !!(track.uri && track.uri === playingUri);
    return h(
      "div",
      {
        key: track.uid || track.uri || String(index),
        className:
          "mixapp-track-row mixapp-results-table-row" + (extra ? " " + extra : ""),
        style: { gridTemplateColumns: gridTemplate },
      },
      cell("mixapp-col-num", String(index + 1)),
      cell(
        "mixapp-col-title",
        h(
          "div",
          { className: "mixapp-title-cell" },
          h(MixAppPlayButton, {
            track,
            playingUri,
            isPlaying,
            onPlay,
            index,
          }),
          titleMeta(track)
        )
      ),
      ...featureCols.map((col) => featureCell(track, col)),
      cell(
        "mixapp-col-dur" + (isCurrent ? " is-current" : ""),
        MixAppApi.formatDuration(track.durationMs)
      ),
      actionCells(track)
    );
  }

  if (loading) {
    return h(
      "div",
      {
        className: "mixapp-arranger-empty mixapp-search-waiting",
        role: "status",
        "aria-live": "polite",
      },
      h("div", {
        className: "mixapp-spinner",
        "aria-hidden": "true",
      }),
      h("p", { className: "mixapp-search-waiting-label" }, loadingLabel || "Loading…")
    );
  }

  if (!list.length) {
    return h("div", { className: "mixapp-arranger-empty" }, emptyLabel || "No tracks.");
  }

  return h(
    "div",
    { className: className || "mixapp-results-table" },
    head(),
    list.map((track, index) => row(track, index))
  );
}
