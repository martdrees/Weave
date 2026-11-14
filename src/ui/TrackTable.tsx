/**
 * Shared catalog / results track table (R2.1).
 * Visual language matches Arranger (play btn, key circle, feat pills, title meta).
 * Column visibility: ResultsColumnConfig (not playlist columnConfig).
 */

import React from "react";
import { formatDuration } from "../api/http.ts";
import * as ResultsColumnConfig from "../state/resultsColumnConfig.ts";
import type { TrackRow } from "../types/track.ts";
import { FeatureCells } from "./shared/FeatureCells.tsx";
import { PlayButton } from "./shared/PlayButton.tsx";

/** Feature columns available in results tables (all Features metrics + Key). */
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

type VisibilityState = ReturnType<typeof ResultsColumnConfig.getVisibility>;

type ColumnMenuState = { x: number; y: number } | null;

export type TrackTableProps = {
  tracks?: TrackRow[] | null;
  playingUri?: string | null;
  isPlaying?: boolean;
  onPlay?: (track: TrackRow, index?: number) => void;
  onAddTrack?: (track: TrackRow) => void;
  onHideTrack?: (track: TrackRow) => void;
  disabledReason?: (track: TrackRow) => string | null | undefined;
  rowClassName?: string | ((track: TrackRow, index: number) => string);
  loading?: boolean;
  loadingLabel?: string;
  emptyLabel?: string;
  className?: string;
  showAlbumInSubtitle?: boolean;
};

function cell(
  classNameCell: string,
  children: React.ReactNode,
  style?: React.CSSProperties
): React.ReactElement {
  return (
    <div className={classNameCell} style={style || undefined}>
      {children}
    </div>
  );
}

/**
 * Playlist-style track table for results / catalog UIs.
 */
export function TrackTable(props: TrackTableProps): React.ReactElement {
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
  } = props;

  const [visibility, setVisibility] = React.useState<VisibilityState>(() =>
    ResultsColumnConfig.getVisibility()
  );
  const [menu, setMenu] = React.useState<ColumnMenuState>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setVisibility(ResultsColumnConfig.getVisibility());
  }, []);

  React.useEffect(() => {
    if (!menu) return undefined;
    function onDoc(e: MouseEvent): void {
      const target = e.target;
      if (
        menuRef.current &&
        target instanceof Node &&
        menuRef.current.contains(target)
      ) {
        return;
      }
      setMenu(null);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const useLayout = React.useLayoutEffect;
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
  const show = (id: string) => ResultsColumnConfig.isVisible(visibility, id);
  const toggleable = ResultsColumnConfig.COLUMNS.filter((c) => !c.always);
  const featureCols = ResultsColumnConfig.COLUMNS.filter((c) =>
    WEAVE_TRACK_TABLE_FEATURE_IDS.includes(c.id)
  );

  const gridTemplate = [
    show("INDEX") ? "36px" : null,
    show("TITLE_AND_ARTIST") ? "minmax(160px, 1.2fr)" : null,
    ...featureCols.map((c) =>
      show(c.id) ? ResultsColumnConfig.featureWidth(c) : null
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

  function openColumnMenu(e: React.MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  function handleToggleColumn(columnId: string): void {
    const next = ResultsColumnConfig.toggle(columnId);
    setVisibility({ ...next });
  }

  function titleMeta(track: TrackRow): React.ReactElement {
    const subParts: string[] = [];
    if (track.artists) subParts.push(track.artists);
    if (showAlbumInSubtitle && track.album) subParts.push(track.album);
    return (
      <div className="weave-track-meta">
        <button
          type="button"
          className="weave-track-meta-title"
          onClick={(e) => {
            e.stopPropagation();
            onPlay?.(track, list.indexOf(track));
          }}
          title="Play"
        >
          {track.name || "Unknown"}
          {track.explicit ? (
            <span className="weave-explicit-mark" title="Explicit">
              {" "}
              E
            </span>
          ) : null}
        </button>
        {subParts.length ? (
          <div className="weave-track-meta-sub" title={subParts.join(" · ")}>
            {subParts.join(" · ")}
          </div>
        ) : null}
      </div>
    );
  }

  function head(): React.ReactElement {
    const cells: React.ReactNode[] = [];
    if (show("INDEX")) cells.push(cell("weave-col-num", "#"));
    if (show("TITLE_AND_ARTIST")) cells.push(cell("weave-col-title", "Track"));
    for (const col of featureCols) {
      if (show(col.id)) {
        cells.push(cell("weave-col-feat weave-col-feat-head", col.label));
      }
    }
    if (show("DURATION")) cells.push(cell("weave-col-dur", "Time"));
    if (show("ACTIONS")) cells.push(cell("weave-col-actions", ""));
    return (
      <div
        className="weave-arranger-head weave-results-table-head"
        style={{ gridTemplateColumns: gridTemplate }}
        onContextMenu={openColumnMenu}
        title="Right-click to show or hide columns"
        role="presentation"
      >
        {cells}
      </div>
    );
  }

  function actionCells(track: TrackRow): React.ReactElement {
    const reason = disabledReason?.(track) || null;
    const disabled = !!reason;
    const buttons: React.ReactNode[] = [];
    if (onAddTrack) {
      buttons.push(
        <button
          key="add"
          type="button"
          className="weave-btn weave-btn-primary"
          disabled={disabled}
          title={reason || "Add to playlist"}
          onClick={() => onAddTrack(track)}
        >
          {disabled ? reason || "In playlist" : "Add"}
        </button>
      );
    }
    if (onHideTrack) {
      buttons.push(
        <button
          key="hide"
          type="button"
          className="weave-btn weave-btn-ghost"
          onClick={() => onHideTrack(track)}
          title="Don't show again this session"
        >
          Hide
        </button>
      );
    }
    return cell("weave-col-actions weave-results-actions", buttons);
  }

  function row(track: TrackRow, index: number): React.ReactElement {
    const extra =
      typeof rowClassName === "function"
        ? rowClassName(track, index)
        : rowClassName || "";
    const isCurrent = !!(track.uri && track.uri === playingUri);
    const cells: React.ReactNode[] = [];
    if (show("INDEX")) cells.push(cell("weave-col-num", String(index + 1)));
    if (show("TITLE_AND_ARTIST")) {
      cells.push(
        cell(
          "weave-col-title",
          <div className="weave-title-cell">
            <PlayButton
              track={track}
              playingUri={playingUri}
              isPlaying={isPlaying}
              onPlay={onPlay}
              index={index}
            />
            {titleMeta(track)}
          </div>
        )
      );
    }
    for (const col of featureCols) {
      if (show(col.id)) {
        cells.push(
          <FeatureCells key={col.id} track={track} col={col} bpmFallbackTempo />
        );
      }
    }
    if (show("DURATION")) {
      cells.push(
        cell(
          "weave-col-dur" + (isCurrent ? " is-current" : ""),
          formatDuration(track.durationMs)
        )
      );
    }
    if (show("ACTIONS")) cells.push(actionCells(track));

    return (
      <div
        key={track.uid || track.uri || String(index)}
        className={
          "weave-track-row weave-results-table-row" + (extra ? " " + extra : "")
        }
        style={{ gridTemplateColumns: gridTemplate }}
        onContextMenu={openColumnMenu}
      >
        {cells}
      </div>
    );
  }

  const columnMenu = menu ? (
    <div
      ref={menuRef}
      className="weave-column-menu"
      style={{ left: menu.x + "px", top: menu.y + "px" }}
      role="menu"
    >
      <div className="weave-column-menu-title">Columns</div>
      {toggleable.map((col) => (
        <label
          key={col.id}
          className="weave-column-menu-item"
          role="menuitemcheckbox"
          aria-checked={show(col.id)}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={show(col.id)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              handleToggleColumn(col.id);
            }}
          />
          <span>{col.label}</span>
        </label>
      ))}
    </div>
  ) : null;

  const menuPortal =
    columnMenu && Spicetify.ReactDOM?.createPortal
      ? Spicetify.ReactDOM.createPortal(columnMenu, document.body)
      : columnMenu;

  if (loading) {
    return (
      <div
        className="weave-arranger-empty weave-search-waiting"
        role="status"
        aria-live="polite"
      >
        <div className="weave-spinner" aria-hidden="true" />
        <p className="weave-search-waiting-label">{loadingLabel || "Loading…"}</p>
      </div>
    );
  }

  if (!list.length) {
    return <div className="weave-arranger-empty">{emptyLabel || "No tracks."}</div>;
  }

  return (
    <div className={className || "weave-results-table"}>
      {head()}
      {list.map((track, index) => row(track, index))}
      {menuPortal}
    </div>
  );
}
