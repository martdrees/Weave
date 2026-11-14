import React from "react";
import { formatDuration } from "../api/http.ts";
import * as Features from "../api/features.ts";
import { t } from "../i18n/index.ts";
import {
  COLUMNS,
  formatAddedAt,
  getVisibility,
  isVisible,
  subscribe,
  toggle,
} from "../state/columnConfig.ts";
import type { TrackRow } from "../types/track.ts";
import { FeatureCells, PlayButton, type FeatureColumn } from "./shared/index.ts";

type ArrangerFeatureCol = FeatureColumn & {
  label: string;
  sortKey: string;
};

type SortState = {
  key: string | null;
  dir: "asc" | "desc" | null;
};

type MenuState = {
  x: number;
  y: number;
};

type DragRefState = {
  from: number | null;
  over: number | null;
  dropped: boolean;
};

export type ArrangerProps = {
  tracks?: TrackRow[] | null;
  loading?: boolean;
  playingUri?: string | null;
  isPlaying?: boolean;
  seedUris?: string[] | null;
  flashUids?: string[] | null;
  listFlashKey?: string | number | null;
  onReorder?: (from: number, to: number) => void;
  onPlay?: (track: TrackRow, index?: number) => void;
  onToggleSeed?: (uri: string) => void;
  onRemove?: (fullIndex: number, track: TrackRow) => void;
  isPlayPending?: (track: TrackRow) => boolean;
};

function featureColWidth(col: ArrangerFeatureCol): string {
  if (col.id === "KEY") return "2.4rem";
  if (col.id === "BPM") return "2.6rem";
  if (col.id === "DANCEABILITY") return "3.25rem";
  if (col.id === "ENERGY") return "3.5rem";
  if (col.id === "VALENCE") return "3.5rem";
  if (col.id === "ACOUSTICNESS") return "4rem";
  if (col.id === "INSTRUMENTALNESS") return "3rem";
  if (col.id === "SPEECHINESS") return "3.1rem";
  if (col.id === "LIVENESS") return "2.75rem";
  if (col.id === "LOUDNESS") return "3rem";
  return "3.5rem";
}

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

function DragGripIcon(): React.ReactElement {
  return (
    <svg
      width={12}
      height={16}
      viewBox="0 0 12 16"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx={3} cy={3} r={1.35} fill="currentColor" />
      <circle cx={9} cy={3} r={1.35} fill="currentColor" />
      <circle cx={3} cy={8} r={1.35} fill="currentColor" />
      <circle cx={9} cy={8} r={1.35} fill="currentColor" />
      <circle cx={3} cy={13} r={1.35} fill="currentColor" />
      <circle cx={9} cy={13} r={1.35} fill="currentColor" />
    </svg>
  );
}

export function Arranger(props: ArrangerProps): React.ReactElement {
  const {
    tracks,
    loading,
    playingUri,
    isPlaying,
    seedUris,
    flashUids,
    listFlashKey,
    onReorder,
    onPlay,
    onToggleSeed,
    onRemove,
    isPlayPending,
  } = props;

  const seedSet = React.useMemo(() => new Set(seedUris || []), [seedUris]);
  const flashSet = React.useMemo(() => new Set(flashUids || []), [flashUids]);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);
  const [listFlashOn, setListFlashOn] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const [followId, setFollowId] = React.useState<string | null>(null);
  const [visibility, setVisibility] = React.useState(() => getVisibility());
  const [menu, setMenu] = React.useState<MenuState | null>(null);
  const [sort, setSort] = React.useState<SortState>({ key: null, dir: null });
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<DragRefState>({
    from: null,
    over: null,
    dropped: false,
  });

  React.useEffect(() => {
    setVisibility(getVisibility());
    return subscribe((next) => setVisibility({ ...next }));
  }, []);

  React.useEffect(() => {
    if (!listFlashKey) return undefined;
    setListFlashOn(true);
    const timer = setTimeout(() => setListFlashOn(false), 700);
    return () => clearTimeout(timer);
  }, [listFlashKey]);

  React.useEffect(() => {
    if (!flashUids?.length) return;
    const el = document.querySelector(".weave-track-row.is-flash");
    el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [flashUids]);

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

  const useLayout = React.useLayoutEffect || React.useEffect;
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

  const startOffsetsMs: number[] = [];
  {
    let sum = 0;
    for (const tr of tracks || []) {
      startOffsetsMs.push(sum);
      sum += Number(tr?.durationMs) || 0;
    }
  }

  const show = (id: string) => isVisible(visibility, id);
  const toggleable = COLUMNS.filter((c) => !c.always);

  const featureCols: ArrangerFeatureCol[] = [
    { id: "BPM", label: t("col.bpm"), sortKey: "bpm" },
    { id: "KEY", label: t("col.key"), sortKey: "key" },
    {
      id: "ENERGY",
      label: t("col.energy"),
      sortKey: "energy",
      metricId: "energy",
    },
    {
      id: "DANCEABILITY",
      label: t("col.dance"),
      sortKey: "danceability",
      metricId: "danceability",
    },
    {
      id: "VALENCE",
      label: t("col.valence"),
      sortKey: "valence",
      metricId: "valence",
    },
    {
      id: "ACOUSTICNESS",
      label: t("col.acoustic"),
      sortKey: "acousticness",
      metricId: "acousticness",
    },
    {
      id: "INSTRUMENTALNESS",
      label: t("col.instr"),
      sortKey: "instrumentalness",
      metricId: "instrumentalness",
    },
    {
      id: "SPEECHINESS",
      label: t("col.speech"),
      sortKey: "speechiness",
      metricId: "speechiness",
    },
    {
      id: "LIVENESS",
      label: t("col.live"),
      sortKey: "liveness",
      metricId: "liveness",
    },
    {
      id: "LOUDNESS",
      label: t("col.loud"),
      sortKey: "loudness",
      metricId: "loudness",
    },
  ];

  const gridTemplate = [
    show("INDEX") ? "52px" : null,
    show("TITLE_AND_ARTIST") ? "minmax(140px, 1fr)" : null,
    show("ADDED_AT") ? "minmax(72px, 0.4fr)" : null,
    ...featureCols.map((c) => (show(c.id) ? featureColWidth(c) : null)),
    show("DURATION") ? "52px" : null,
    show("ACTIONS") ? "108px" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const displayTracks =
    sort.key && sort.dir
      ? Features.sortTracks(tracks || [], sort.key, sort.dir)
      : tracks || [];

  React.useEffect(() => {
    if (!followId) return;
    const di = displayTracks.findIndex(
      (tr) => tr.uid === followId || tr.uri === followId
    );
    setFollowId(null);
    if (di >= 0) setActiveIndex(di);
  }, [displayTracks, followId]);

  React.useEffect(() => {
    if (followId) return;
    setActiveIndex((idx) => {
      if (idx == null) return idx;
      if (!displayTracks.length) return null;
      return Math.min(idx, displayTracks.length - 1);
    });
  }, [displayTracks.length, sort.key, sort.dir, followId]);

  React.useEffect(() => {
    if (activeIndex == null) return;
    const el = document.getElementById("weave-arranger-row-" + activeIndex);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  function indexInFull(track: TrackRow | null | undefined): number {
    if (!track) return -1;
    const list = tracks || [];
    if (track.uid) {
      const byUid = list.findIndex((tr) => tr && tr.uid === track.uid);
      if (byUid >= 0) return byUid;
    }
    return list.findIndex((tr) => tr && tr.uri && tr.uri === track.uri);
  }

  function removeDisplay(displayIndex: number): void {
    const track = displayTracks[displayIndex];
    if (!track) return;
    const full = indexInFull(track);
    if (full < 0) return;
    onRemove?.(full, track);
  }

  function moveDisplay(fromDisplay: number, toDisplay: number): void {
    const fromTrack = displayTracks[fromDisplay];
    const toTrack = displayTracks[toDisplay];
    if (!fromTrack || !toTrack) return;
    const from = indexInFull(fromTrack);
    const to = indexInFull(toTrack);
    if (from < 0 || to < 0 || from === to) return;
    onReorder?.(from, to);
  }

  function selectDisplay(index: number | null): void {
    if (index == null || index < 0 || index >= displayTracks.length) return;
    setActiveIndex(index);
    listRef.current?.focus?.({ preventScroll: true });
  }

  function clearDrag(): void {
    dragRef.current = { from: null, over: null, dropped: false };
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function onRowDragOver(e: React.DragEvent, index: number): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragRef.current.from == null) return;
    if (dragRef.current.over !== index) {
      dragRef.current.over = index;
      setDragOverIndex(index);
    }
  }

  function beginRowDrag(e: React.DragEvent, index: number): void {
    const target = e.target;
    if (
      target instanceof Element &&
      target.closest(
        "button, a, input, .weave-play-btn, .weave-icon-btn, .weave-col-sort, .weave-col-actions"
      )
    ) {
      e.preventDefault();
      return;
    }
    const current = e.currentTarget;
    const row = current.classList.contains("weave-track-row")
      ? current
      : current.closest(".weave-track-row");
    const hgt = row instanceof HTMLElement ? row.offsetHeight || 40 : 40;
    dragRef.current = { from: index, over: index, dropped: false };
    setDragIndex(index);
    setDragOverIndex(index);
    selectDisplay(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    if (row instanceof HTMLElement) {
      try {
        e.dataTransfer.setDragImage(row, 28, hgt / 2);
      } catch {
        /* some embeds block setDragImage */
      }
    }
  }

  function applyDragMove(from: number, to: number): void {
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
    const moved = displayTracks[from];
    const id = moved?.uid || moved?.uri || null;
    moveDisplay(from, to);
    if (id) setFollowId(id);
    else setActiveIndex(to);
  }

  function finishRowDrop(e: React.DragEvent, index: number): void {
    e.preventDefault();
    e.stopPropagation();
    const fromRaw = e.dataTransfer.getData("text/plain");
    const from =
      dragRef.current.from != null
        ? dragRef.current.from
        : fromRaw !== ""
          ? Number(fromRaw)
          : NaN;
    const to = dragRef.current.over != null ? dragRef.current.over : index;
    dragRef.current.dropped = true;
    applyDragMove(from, to);
    clearDrag();
  }

  function finishRowDragEnd(): void {
    if (!dragRef.current.dropped && dragRef.current.from != null) {
      const from = dragRef.current.from;
      const to = dragRef.current.over != null ? dragRef.current.over : from;
      applyDragMove(from, to);
    }
    clearDrag();
  }

  function handleListKeyDown(e: React.KeyboardEvent): void {
    if (menu) return;
    const n = displayTracks.length;
    if (!n) return;
    if (e.ctrlKey || e.metaKey) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const cur = activeIndex == null ? (e.key === "ArrowDown" ? -1 : n) : activeIndex;
      if (e.altKey) {
        if (activeIndex == null) {
          setActiveIndex(e.key === "ArrowDown" ? 0 : n - 1);
          return;
        }
        const to = e.key === "ArrowDown" ? activeIndex + 1 : activeIndex - 1;
        if (to < 0 || to >= n) return;
        const moved = displayTracks[activeIndex];
        const id = moved?.uid || moved?.uri || null;
        moveDisplay(activeIndex, to);
        if (id) setFollowId(id);
        else setActiveIndex(to);
        return;
      }
      const next =
        e.key === "ArrowDown" ? Math.min(n - 1, cur + 1) : Math.max(0, cur - 1);
      setActiveIndex(next);
      return;
    }

    if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(n - 1);
      return;
    }

    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      activeIndex != null &&
      !e.altKey
    ) {
      e.preventDefault();
      const removeAt = activeIndex;
      removeDisplay(removeAt);
      setActiveIndex(() => {
        if (!displayTracks.length || displayTracks.length <= 1) return null;
        return Math.min(removeAt, displayTracks.length - 2);
      });
    }
  }

  function openColumnMenu(e: React.MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  function handleToggleColumn(columnId: string): void {
    const next = toggle(columnId);
    setVisibility({ ...next });
  }

  function cycleSort(sortKey: string): void {
    let next: SortState = { key: sortKey, dir: "asc" };
    if (sort.key === sortKey && sort.dir === "asc")
      next = { key: sortKey, dir: "desc" };
    else if (sort.key === sortKey && sort.dir === "desc")
      next = { key: null, dir: null };
    setSort(next);
  }

  function headButton(label: string, sortKey: string): React.ReactElement {
    const active = sort.key === sortKey;
    const arrow = !active ? "" : sort.dir === "asc" ? " ↑" : " ↓";
    return (
      <button
        type="button"
        className={"weave-col-sort" + (active ? " is-active" : "")}
        onClick={(ev) => {
          ev.stopPropagation();
          cycleSort(sortKey);
        }}
        title={t("arranger.sortBy", { label })}
      >
        {label + arrow}
      </button>
    );
  }

  if (loading) {
    return (
      <div className="weave-arranger weave-arranger-empty weave-empty-state">
        <div className="weave-spinner" aria-hidden="true" />
        <p className="weave-empty-title">{t("picker.loading")}</p>
        <p className="weave-empty-hint">{t("arranger.loading")}</p>
      </div>
    );
  }

  if (!tracks?.length) {
    return (
      <div className="weave-arranger weave-arranger-empty weave-empty-state">
        <p className="weave-empty-title">{t("arranger.empty")}</p>
        <p className="weave-empty-hint">{t("arranger.emptyHint")}</p>
      </div>
    );
  }

  function trackMetaBox(track: TrackRow): React.ReactElement {
    const isSeed = seedSet.has(track.uri);
    const subParts: string[] = [];
    if (track.artists) subParts.push(track.artists);
    if (show("ALBUM") && track.album) subParts.push(track.album);
    const duration = formatDuration(track.durationMs);
    const titleText =
      (track.name || t("common.unknown")) +
      (duration && duration !== "—" ? " (" + duration + ")" : "");
    return (
      <div className="weave-track-meta">
        <button
          type="button"
          className={"weave-track-meta-title" + (isSeed ? " is-seed" : "")}
          onClick={(ev) => {
            ev.stopPropagation();
            const di = displayTracks.findIndex(
              (tr) => tr.uid === track.uid || tr.uri === track.uri
            );
            if (di >= 0) selectDisplay(di);
            onToggleSeed?.(track.uri);
          }}
          title={isSeed ? t("arranger.seedUnmark") : t("arranger.seedMark")}
        >
          {titleText}
        </button>
        {subParts.length ? (
          <div className="weave-track-meta-sub" title={subParts.join(" · ")}>
            {subParts.join(" · ")}
          </div>
        ) : null}
      </div>
    );
  }

  function startTimeLabel(track: TrackRow): string {
    const fullIndex = indexInFull(track);
    const startMs = fullIndex >= 0 ? (startOffsetsMs[fullIndex] ?? 0) : 0;
    return formatDuration(startMs);
  }

  function headCells(): React.ReactElement[] {
    const cells: React.ReactElement[] = [];
    if (show("INDEX")) {
      cells.push(cell("weave-col-num", headButton(t("col.index"), "index")));
    }
    if (show("TITLE_AND_ARTIST")) {
      cells.push(cell("weave-col-title", headButton(t("col.track"), "name")));
    }
    if (show("ADDED_AT")) {
      cells.push(cell("weave-col-added", t("col.added")));
    }
    for (const col of featureCols) {
      if (show(col.id)) {
        cells.push(
          cell("weave-col-feat weave-col-feat-head", headButton(col.label, col.sortKey))
        );
      }
    }
    if (show("DURATION")) {
      cells.push(cell("weave-col-dur", headButton(t("col.time"), "index")));
    }
    if (show("ACTIONS")) cells.push(cell("weave-col-actions", ""));
    return cells;
  }

  function rowCells(track: TrackRow, index: number): React.ReactElement[] {
    const cells: React.ReactElement[] = [];
    const fullIndex = indexInFull(track);
    if (show("INDEX")) {
      cells.push(
        cell(
          "weave-col-num",
          <div className="weave-index-cell">
            <span
              className="weave-drag-handle"
              title={t("arranger.drag")}
              aria-label={t("arranger.drag")}
              onClick={(ev) => ev.stopPropagation()}
            >
              <DragGripIcon />
            </span>
            <span className="weave-index-num">
              {fullIndex >= 0 ? fullIndex + 1 : index + 1}
            </span>
          </div>
        )
      );
    }
    if (show("TITLE_AND_ARTIST")) {
      const playName = track.name || t("arranger.trackFallback");
      const pendingPlay = !!isPlayPending?.(track);
      cells.push(
        cell(
          "weave-col-title",
          <div className="weave-title-cell">
            <PlayButton
              track={track}
              playingUri={playingUri}
              isPlaying={isPlaying}
              onPlay={onPlay}
              index={fullIndex}
              pending={pendingPlay}
              playLabel={t("arranger.play", { name: playName })}
              pauseLabel={t("arranger.pause", { name: playName })}
              pendingLabel={t("arranger.playPending", { name: playName })}
            />
            {trackMetaBox(track)}
          </div>
        )
      );
    }
    if (show("ADDED_AT")) {
      cells.push(cell("weave-col-added", formatAddedAt(track.addedAt)));
    }
    for (const col of featureCols) {
      if (show(col.id)) {
        cells.push(
          <FeatureCells key={col.id} track={track} col={col} bpmFallbackTempo={false} />
        );
      }
    }
    if (show("DURATION")) {
      const isCurrent = !!(track.uri && track.uri === playingUri);
      cells.push(
        cell("weave-col-dur" + (isCurrent ? " is-current" : ""), startTimeLabel(track))
      );
    }
    if (show("ACTIONS")) {
      cells.push(
        cell(
          "weave-col-actions",
          <>
            <button
              type="button"
              className="weave-icon-btn"
              disabled={index === 0}
              onClick={(ev) => {
                ev.stopPropagation();
                moveDisplay(index, index - 1);
              }}
              title={t("arranger.moveUp")}
            >
              ↑
            </button>
            <button
              type="button"
              className="weave-icon-btn"
              disabled={index >= displayTracks.length - 1}
              onClick={(ev) => {
                ev.stopPropagation();
                moveDisplay(index, index + 1);
              }}
              title={t("arranger.moveDown")}
            >
              ↓
            </button>
            <button
              type="button"
              className="weave-icon-btn weave-icon-btn-danger"
              onClick={(ev) => {
                ev.stopPropagation();
                removeDisplay(index);
              }}
              title={t("arranger.remove")}
              aria-label={t("arranger.remove")}
            >
              <svg
                viewBox="0 0 16 16"
                width={14}
                height={14}
                aria-hidden="true"
                focusable="false"
              >
                <path
                  fill="currentColor"
                  d="M5.5 1a1 1 0 0 0-.9.55L4.1 2H2.5a.5.5 0 0 0 0 1h11a.5.5 0 0 0 0-1H11.9l-.5-.45A1 1 0 0 0 10.5 1h-5zM3.5 4v9.5A1.5 1.5 0 0 0 5 15h6a1.5 1.5 0 0 0 1.5-1.5V4h-9zm2 2.5a.5.5 0 0 1 1 0v6a.5.5 0 0 1-1 0v-6zm3 0a.5.5 0 0 1 1 0v6a.5.5 0 0 1-1 0v-6z"
                />
              </svg>
            </button>
          </>
        )
      );
    }
    return cells;
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
          onMouseDown={(ev) => ev.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={show(col.id)}
            onMouseDown={(ev) => ev.stopPropagation()}
            onClick={(ev) => ev.stopPropagation()}
            onChange={(ev) => {
              ev.stopPropagation();
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

  const activeDescendant =
    activeIndex != null ? "weave-arranger-row-" + activeIndex : undefined;

  return (
    <div className="weave-arranger-wrap">
      <div
        ref={listRef}
        className={
          "weave-arranger" +
          (listFlashOn ? " is-flash" : "") +
          (dragIndex != null ? " is-reordering" : "")
        }
        role="listbox"
        tabIndex={0}
        aria-label={t("arranger.aria")}
        aria-activedescendant={activeDescendant}
        onKeyDown={handleListKeyDown}
      >
        <div
          className="weave-arranger-head"
          style={{ gridTemplateColumns: gridTemplate }}
          onContextMenu={openColumnMenu}
          title={t("arranger.columnsMenu")}
          role="presentation"
        >
          {headCells()}
        </div>
        {!displayTracks.length ? (
          <div className="weave-arranger-empty">{t("arranger.empty")}</div>
        ) : (
          displayTracks.map((track, index) => (
            <div
              key={(track.uid || track.uri) + "-" + index}
              id={"weave-arranger-row-" + index}
              role="option"
              aria-selected={activeIndex === index}
              className={
                "weave-track-row" +
                (dragIndex === index ? " is-dragging" : "") +
                (dragOverIndex === index && dragIndex !== index
                  ? " is-drag-over"
                  : "") +
                (seedSet.has(track.uri) ? " is-seed" : "") +
                (flashSet.has(track.uid) || flashSet.has(track.uri)
                  ? " is-flash"
                  : "") +
                (activeIndex === index ? " is-active" : "")
              }
              style={{ gridTemplateColumns: gridTemplate }}
              draggable
              title={
                seedSet.has(track.uri) ? t("arranger.rowSeed") : t("arranger.rowNormal")
              }
              onClick={(ev) => {
                const target = ev.target;
                if (
                  target instanceof Element &&
                  target.closest(
                    "button, a, input, .weave-play-btn, .weave-icon-btn, .weave-drag-handle, .weave-col-sort, .weave-col-actions"
                  )
                ) {
                  return;
                }
                selectDisplay(index);
                onToggleSeed?.(track.uri);
              }}
              onDragStart={(ev) => beginRowDrag(ev, index)}
              onDragEnd={() => finishRowDragEnd()}
              onDragOver={(ev) => onRowDragOver(ev, index)}
              onDrop={(ev) => finishRowDrop(ev, index)}
            >
              {rowCells(track, index)}
            </div>
          ))
        )}
      </div>
      {menuPortal}
    </div>
  );
}
