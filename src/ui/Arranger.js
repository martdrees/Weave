//@ts-check

function MixAppArranger(props) {
  const react = Spicetify.React;
  const {
    tracks,
    loading,
    playingUri,
    isPlaying,
    seedUris,
    onReorder,
    onPlay,
    onToggleSeed,
    onRemove,
  } = props;
  const seedSet = new Set(seedUris || []);
  const [dragIndex, setDragIndex] = react.useState(null);
  const [visibility, setVisibility] = react.useState(() =>
    MixAppColumnConfig.getVisibility()
  );
  const [menu, setMenu] = react.useState(null);
  const [sort, setSort] = react.useState({ key: null, dir: null });
  const menuRef = react.useRef(null);

  react.useEffect(() => {
    setVisibility(MixAppColumnConfig.getVisibility());
    return MixAppColumnConfig.subscribe((next) => setVisibility({ ...next }));
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

  // Keep the menu inside the viewport after mount (size known).
  const useLayout =
    react.useLayoutEffect || react.useEffect;
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

  // Cumulative playlist start time (ms) for each playlist-order index.
  const startOffsetsMs = [];
  {
    let sum = 0;
    for (const t of tracks || []) {
      startOffsetsMs.push(sum);
      sum += Number(t?.durationMs) || 0;
    }
  }

  const show = (id) => MixAppColumnConfig.isVisible(visibility, id);
  const toggleable = MixAppColumnConfig.COLUMNS.filter((c) => !c.always);

  const featureCols = [
    { id: "BPM", label: "BPM", sortKey: "bpm" },
    { id: "KEY", label: "Key", sortKey: "key" },
    { id: "ENERGY", label: "Energy", sortKey: "energy", metricId: "energy" },
    { id: "DANCEABILITY", label: "Dance", sortKey: "danceability", metricId: "danceability" },
    { id: "VALENCE", label: "Valence", sortKey: "valence", metricId: "valence" },
    { id: "ACOUSTICNESS", label: "Acoustic", sortKey: "acousticness", metricId: "acousticness" },
  ];

  function featureColWidth(col) {
    // Narrow fixed cols — color lives on a small pill, not the whole cell.
    if (col.id === "KEY") return "2.4rem";
    if (col.id === "BPM") return "2.6rem";
    return "2.8rem";
  }

  const gridTemplate = [
    show("INDEX") ? "36px" : null,
    show("TITLE_AND_ARTIST") ? "minmax(140px, 1fr)" : null,
    show("ADDED_AT") ? "minmax(72px, 0.4fr)" : null,
    ...featureCols.map((c) => (show(c.id) ? featureColWidth(c) : null)),
    show("DURATION") ? "52px" : null,
    show("ACTIONS") ? "84px" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const displayTracks =
    sort.key && sort.dir
      ? MixAppFeatures.sortTracks(tracks, sort.key, sort.dir)
      : tracks || [];

  const metricRanges = {};
  for (const col of featureCols) {
    if (!show(col.id)) continue;
    const metricId = col.metricId || (col.id === "BPM" ? "tempo" : null);
    if (!metricId) continue;
    const metric = MixAppFeatures.METRICS.find((m) => m.id === metricId);
    if (metric) metricRanges[metricId] = MixAppFeatures.rangeForMetric(tracks, metric);
  }

  function indexInFull(track) {
    return (tracks || []).findIndex(
      (t) => t.uid === track.uid || t.uri === track.uri
    );
  }

  function removeDisplay(displayIndex) {
    const track = displayTracks[displayIndex];
    if (!track) return;
    const full = indexInFull(track);
    if (full < 0) return;
    onRemove?.(full, track);
  }

  function moveDisplay(fromDisplay, toDisplay) {
    const fromTrack = displayTracks[fromDisplay];
    const toTrack = displayTracks[toDisplay];
    if (!fromTrack || !toTrack) return;
    const from = indexInFull(fromTrack);
    const to = indexInFull(toTrack);
    if (from < 0 || to < 0 || from === to) return;
    onReorder(from, to);
  }

  function openColumnMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  function handleToggleColumn(columnId) {
    const next = MixAppColumnConfig.toggle(columnId);
    setVisibility({ ...next });
  }

  function cycleSort(sortKey) {
    let next = { key: sortKey, dir: "asc" };
    if (sort.key === sortKey && sort.dir === "asc") next = { key: sortKey, dir: "desc" };
    else if (sort.key === sortKey && sort.dir === "desc")
      next = { key: null, dir: null };
    setSort(next);
  }

  function headButton(label, sortKey, className) {
    const active = sort.key === sortKey;
    const arrow = !active ? "" : sort.dir === "asc" ? " ↑" : " ↓";
    return react.createElement(
      "button",
      {
        type: "button",
        className: "mixapp-col-sort" + (active ? " is-active" : ""),
        onClick: (e) => {
          e.stopPropagation();
          cycleSort(sortKey);
        },
        title: "Sort by " + label,
      },
      label + arrow
    );
  }

  if (loading) {
    return react.createElement(
      "div",
      { className: "mixapp-arranger mixapp-arranger-empty" },
      "Loading tracks…"
    );
  }

  if (!tracks?.length) {
    return react.createElement(
      "div",
      { className: "mixapp-arranger mixapp-arranger-empty" },
      "Select a playlist to edit its track order."
    );
  }

  function cell(className, children, style) {
    return react.createElement("div", { className, style: style || undefined }, children);
  }

  function featureCell(track, col) {
    if (col.id === "KEY") {
      const bg = MixAppFeatures.camelotBackground(
        track.keyIndex,
        track.keyMode,
        track.key
      );
      return cell(
        "mixapp-col-feat mixapp-col-key",
        react.createElement(
          "span",
          {
            className:
              "mixapp-key-circle" + (track.key ? "" : " is-empty"),
            style: bg ? { background: bg } : undefined,
          },
          track.key || "—"
        )
      );
    }
    if (col.id === "BPM") {
      const text =
        track.bpm != null && track.bpm !== "" ? String(track.bpm) : "—";
      return cell(
        "mixapp-col-feat mixapp-col-bpm",
        react.createElement("span", { className: "mixapp-feat-pill" }, text)
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
      react.createElement(
        "span",
        {
          className: "mixapp-feat-pill",
          style: bg ? { background: bg } : undefined,
        },
        text
      )
    );
  }

  function headCells() {
    const cells = [];
    if (show("INDEX")) {
      cells.push(cell("mixapp-col-num", headButton("#", "index")));
    }
    if (show("TITLE_AND_ARTIST")) {
      cells.push(cell("mixapp-col-title", headButton("Track", "name")));
    }
    if (show("ADDED_AT")) cells.push(cell("mixapp-col-added", "Date added"));
    for (const col of featureCols) {
      if (show(col.id)) {
        cells.push(
          cell(
            "mixapp-col-feat mixapp-col-feat-head",
            headButton(col.label, col.sortKey)
          )
        );
      }
    }
    if (show("DURATION")) {
      cells.push(cell("mixapp-col-dur", headButton("Time", "index")));
    }
    if (show("ACTIONS")) cells.push(cell("mixapp-col-actions", ""));
    return cells;
  }

  function trackMetaBox(track) {
    const isSeed = seedSet.has(track.uri);
    const subParts = [];
    if (track.artists) subParts.push(track.artists);
    if (show("ALBUM") && track.album) subParts.push(track.album);
    const duration = MixAppApi.formatDuration(track.durationMs);
    const titleText =
      (track.name || "Unknown") +
      (duration && duration !== "—" ? " (" + duration + ")" : "");
    return react.createElement(
      "div",
      { className: "mixapp-track-meta" },
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-track-meta-title" + (isSeed ? " is-seed" : ""),
          onClick: (e) => {
            e.stopPropagation();
            onToggleSeed?.(track.uri);
          },
          title: isSeed ? "Remove seed" : "Mark as seed track",
        },
        titleText
      ),
      subParts.length
        ? react.createElement(
            "div",
            { className: "mixapp-track-meta-sub", title: subParts.join(" · ") },
            subParts.join(" · ")
          )
        : null
    );
  }

  function startTimeLabel(track) {
    const fullIndex = indexInFull(track);
    const startMs =
      fullIndex >= 0 ? startOffsetsMs[fullIndex] ?? 0 : 0;
    return MixAppApi.formatDuration(startMs);
  }

  function rowCells(track, index) {
    const cells = [];
    const fullIndex = indexInFull(track);
    if (show("INDEX")) {
      cells.push(
        cell(
          "mixapp-col-num mixapp-drag-handle",
          react.createElement(
            "span",
            { title: "Drag to reorder" },
            fullIndex >= 0 ? fullIndex + 1 : index + 1
          )
        )
      );
    }
    if (show("TITLE_AND_ARTIST")) {
      const active = !!(track.uri && track.uri === playingUri && isPlaying);
      const playLabel = active
        ? "Pause " + (track.name || "track")
        : "Play " + (track.name || "track");
      cells.push(
        cell(
          "mixapp-col-title",
          react.createElement(
            "div",
            { className: "mixapp-title-cell" },
            react.createElement(
              "button",
              {
                type: "button",
                className: "mixapp-play-btn" + (active ? " is-playing" : ""),
                onClick: (e) => {
                  e.stopPropagation();
                  onPlay?.(track, fullIndex);
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
            ),
            trackMetaBox(track)
          )
        )
      );
    }
    if (show("ADDED_AT")) {
      cells.push(
        cell(
          "mixapp-col-added",
          MixAppColumnConfig.formatAddedAt(track.addedAt)
        )
      );
    }
    for (const col of featureCols) {
      if (show(col.id)) cells.push(featureCell(track, col));
    }
    if (show("DURATION")) {
      const isCurrent = !!(track.uri && track.uri === playingUri);
      cells.push(
        cell(
          "mixapp-col-dur" + (isCurrent ? " is-current" : ""),
          startTimeLabel(track)
        )
      );
    }
    if (show("ACTIONS")) {
      cells.push(
        cell("mixapp-col-actions", [
          react.createElement(
            "button",
            {
              key: "up",
              type: "button",
              className: "mixapp-icon-btn",
              disabled: index === 0,
              onClick: (e) => {
                e.stopPropagation();
                moveDisplay(index, index - 1);
              },
              title: "Move up",
            },
            "↑"
          ),
          react.createElement(
            "button",
            {
              key: "down",
              type: "button",
              className: "mixapp-icon-btn",
              disabled: index >= displayTracks.length - 1,
              onClick: (e) => {
                e.stopPropagation();
                moveDisplay(index, index + 1);
              },
              title: "Move down",
            },
            "↓"
          ),
          react.createElement(
            "button",
            {
              key: "remove",
              type: "button",
              className: "mixapp-icon-btn mixapp-icon-btn-danger",
              onClick: (e) => {
                e.stopPropagation();
                removeDisplay(index);
              },
              title: "Remove from playlist",
              "aria-label": "Remove from playlist",
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
              react.createElement("path", {
                fill: "currentColor",
                d: "M5.5 1a1 1 0 0 0-.9.55L4.1 2H2.5a.5.5 0 0 0 0 1h11a.5.5 0 0 0 0-1H11.9l-.5-.45A1 1 0 0 0 10.5 1h-5zM3.5 4v9.5A1.5 1.5 0 0 0 5 15h6a1.5 1.5 0 0 0 1.5-1.5V4h-9zm2 2.5a.5.5 0 0 1 1 0v6a.5.5 0 0 1-1 0v-6zm3 0a.5.5 0 0 1 1 0v6a.5.5 0 0 1-1 0v-6z",
              })
            )
          ),
        ])
      );
    }
    return cells;
  }

  const columnMenu = menu
    ? react.createElement(
        "div",
        {
          ref: menuRef,
          className: "mixapp-column-menu",
          style: { left: menu.x + "px", top: menu.y + "px" },
          role: "menu",
        },
        react.createElement(
          "div",
          { className: "mixapp-column-menu-title" },
          "Columns"
        ),
        toggleable.map((col) =>
          react.createElement(
            "label",
            {
              key: col.id,
              className: "mixapp-column-menu-item",
              role: "menuitemcheckbox",
              "aria-checked": show(col.id),
              onMouseDown: (e) => e.stopPropagation(),
            },
            react.createElement("input", {
              type: "checkbox",
              checked: show(col.id),
              onMouseDown: (e) => e.stopPropagation(),
              onClick: (e) => e.stopPropagation(),
              onChange: (e) => {
                e.stopPropagation();
                handleToggleColumn(col.id);
              },
            }),
            react.createElement("span", null, col.label)
          )
        )
      )
    : null;

  // Portal to body so position:fixed tracks the cursor (Spotify ancestors often
  // use transform, which otherwise offsets fixed coordinates).
  const menuPortal =
    columnMenu && Spicetify.ReactDOM?.createPortal
      ? Spicetify.ReactDOM.createPortal(columnMenu, document.body)
      : columnMenu;

  return react.createElement(
    "div",
    { className: "mixapp-arranger-wrap" },
    react.createElement(
      "div",
      { className: "mixapp-arranger" },
      react.createElement(
        "div",
        {
          className: "mixapp-arranger-head",
          style: { gridTemplateColumns: gridTemplate },
          onContextMenu: openColumnMenu,
          title: "Right-click to show or hide columns",
        },
        ...headCells()
      ),
      !displayTracks.length
        ? react.createElement(
            "div",
            { className: "mixapp-arranger-empty" },
            "Select a playlist to edit its track order."
          )
        : displayTracks.map((track, index) =>
            react.createElement(
              "div",
              {
                key: (track.uid || track.uri) + "-" + index,
                className:
                  "mixapp-track-row" +
                  (dragIndex === index ? " is-dragging" : "") +
                  (seedSet.has(track.uri) ? " is-seed" : ""),
                style: { gridTemplateColumns: gridTemplate },
                draggable: true,
                title: seedSet.has(track.uri)
                  ? "Seed track — click title to unmark"
                  : "Click title to mark as seed",
                onClick: (e) => {
                  if (
                    e.target?.closest?.(
                      "button, a, input, .mixapp-play-btn, .mixapp-icon-btn, .mixapp-drag-handle, .mixapp-col-sort"
                    )
                  ) {
                    return;
                  }
                  onToggleSeed?.(track.uri);
                },
                onDragStart: (e) => {
                  setDragIndex(index);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(index));
                },
                onDragEnd: () => setDragIndex(null),
                onDragOver: (e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                },
                onDrop: (e) => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData("text/plain"));
                  moveDisplay(from, index);
                  setDragIndex(null);
                },
              },
              ...rowCells(track, index)
            )
          )
    ),
    menuPortal
  );
}
