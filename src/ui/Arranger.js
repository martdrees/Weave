//@ts-check

function MixAppArranger(props) {
  const react = Spicetify.React;
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
  } = props;
  const seedSet = new Set(seedUris || []);
  const flashSet = new Set(flashUids || []);
  const [dragIndex, setDragIndex] = react.useState(null);
  const [dragOverIndex, setDragOverIndex] = react.useState(null);
  const [dragRowHeight, setDragRowHeight] = react.useState(40);
  const [listFlashOn, setListFlashOn] = react.useState(false);
  /** Display-index of keyboard/mouse selection (R6.2). */
  const [activeIndex, setActiveIndex] = react.useState(null);
  const [followId, setFollowId] = react.useState(null);
  const [visibility, setVisibility] = react.useState(() =>
    MixAppColumnConfig.getVisibility()
  );
  const [menu, setMenu] = react.useState(null);
  const [sort, setSort] = react.useState({ key: null, dir: null });
  const menuRef = react.useRef(null);
  const listRef = react.useRef(null);

  react.useEffect(() => {
    setVisibility(MixAppColumnConfig.getVisibility());
    return MixAppColumnConfig.subscribe((next) => setVisibility({ ...next }));
  }, []);

  // R5.4 — whole-list pulse after Flowify (etc.)
  react.useEffect(() => {
    if (!listFlashKey) return undefined;
    setListFlashOn(true);
    const t = setTimeout(() => setListFlashOn(false), 700);
    return () => clearTimeout(t);
  }, [listFlashKey]);

  // Scroll first newly added row into view.
  react.useEffect(() => {
    if (!flashUids?.length) return;
    const el = document.querySelector(".mixapp-track-row.is-flash");
    el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [flashUids]);

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
    { id: "BPM", label: MixAppI18n.t("col.bpm"), sortKey: "bpm" },
    { id: "KEY", label: MixAppI18n.t("col.key"), sortKey: "key" },
    { id: "ENERGY", label: MixAppI18n.t("col.energy"), sortKey: "energy", metricId: "energy" },
    {
      id: "DANCEABILITY",
      label: MixAppI18n.t("col.dance"),
      sortKey: "danceability",
      metricId: "danceability",
    },
    { id: "VALENCE", label: MixAppI18n.t("col.valence"), sortKey: "valence", metricId: "valence" },
    {
      id: "ACOUSTICNESS",
      label: MixAppI18n.t("col.acoustic"),
      sortKey: "acousticness",
      metricId: "acousticness",
    },
    {
      id: "INSTRUMENTALNESS",
      label: MixAppI18n.t("col.instr"),
      sortKey: "instrumentalness",
      metricId: "instrumentalness",
    },
    {
      id: "SPEECHINESS",
      label: MixAppI18n.t("col.speech"),
      sortKey: "speechiness",
      metricId: "speechiness",
    },
    {
      id: "LIVENESS",
      label: MixAppI18n.t("col.live"),
      sortKey: "liveness",
      metricId: "liveness",
    },
    {
      id: "LOUDNESS",
      label: MixAppI18n.t("col.loud"),
      sortKey: "loudness",
      metricId: "loudness",
    },
  ];

  function featureColWidth(col) {
    // Fixed cols sized for full header labels (no ellipsis).
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

  const gridTemplate = [
    show("INDEX") ? "52px" : null,
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

  // After reorder (esp. while sorted), re-select the same track by uid/uri.
  react.useEffect(() => {
    if (!followId) return;
    const di = displayTracks.findIndex((t) => t.uid === followId || t.uri === followId);
    setFollowId(null);
    if (di >= 0) setActiveIndex(di);
  }, [displayTracks, followId]);

  // Keep selection in range when the list shrinks / sorts.
  react.useEffect(() => {
    if (followId) return;
    setActiveIndex((idx) => {
      if (idx == null) return idx;
      if (!displayTracks.length) return null;
      return Math.min(idx, displayTracks.length - 1);
    });
  }, [displayTracks.length, sort.key, sort.dir, followId]);

  react.useEffect(() => {
    if (activeIndex == null) return;
    const el = document.getElementById("mixapp-arranger-row-" + activeIndex);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  const metricRanges = {};
  for (const col of featureCols) {
    if (!show(col.id)) continue;
    const metricId = col.metricId || (col.id === "BPM" ? "tempo" : null);
    if (!metricId) continue;
    const metric = MixAppFeatures.METRICS.find((m) => m.id === metricId);
    if (metric) metricRanges[metricId] = MixAppFeatures.rangeForMetric(tracks, metric);
  }

  function indexInFull(track) {
    return (tracks || []).findIndex((t) => t.uid === track.uid || t.uri === track.uri);
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

  function selectDisplay(index) {
    if (index == null || index < 0 || index >= displayTracks.length) return;
    setActiveIndex(index);
    listRef.current?.focus?.({ preventScroll: true });
  }

  function clearDrag() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  /** Live shift other rows while dragging (HTML5 DnD keeps DOM order stable). */
  function rowDragStyle(index) {
    const base = { gridTemplateColumns: gridTemplate };
    if (dragIndex == null || dragOverIndex == null || dragIndex === dragOverIndex) {
      return base;
    }
    if (index === dragIndex) return base;

    let ty = 0;
    if (dragIndex < dragOverIndex) {
      if (index > dragIndex && index <= dragOverIndex) ty = -dragRowHeight;
    } else if (index >= dragOverIndex && index < dragIndex) {
      ty = dragRowHeight;
    }
    if (ty) {
      base.transform = "translateY(" + ty + "px)";
      base.zIndex = 1;
    }
    return base;
  }

  function onRowDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndex == null) return;
    if (index !== dragOverIndex) setDragOverIndex(index);
  }

  function beginRowDrag(e, index) {
    const row = e.currentTarget?.closest?.(".mixapp-track-row");
    const hgt = row?.offsetHeight || e.currentTarget?.offsetHeight || 40;
    setDragRowHeight(hgt);
    setDragIndex(index);
    setDragOverIndex(index);
    selectDisplay(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    if (row) {
      try {
        e.dataTransfer.setDragImage(row, 28, hgt / 2);
      } catch (_) {
        /* some embeds block setDragImage */
      }
    }
  }

  function finishRowDrop(e, index) {
    e.preventDefault();
    const fromRaw = e.dataTransfer.getData("text/plain");
    const from = dragIndex != null ? dragIndex : fromRaw !== "" ? Number(fromRaw) : NaN;
    const to = dragOverIndex != null ? dragOverIndex : index;
    if (Number.isFinite(from) && Number.isFinite(to) && from !== to) {
      const moved = displayTracks[from];
      const id = moved?.uid || moved?.uri || null;
      moveDisplay(from, to);
      if (id) setFollowId(id);
      else setActiveIndex(to);
    }
    clearDrag();
  }

  const dragGripIcon = h(
    "svg",
    {
      width: 12,
      height: 16,
      viewBox: "0 0 12 16",
      "aria-hidden": "true",
      focusable: "false",
    },
    h("circle", { cx: 3, cy: 3, r: 1.35, fill: "currentColor" }),
    h("circle", { cx: 9, cy: 3, r: 1.35, fill: "currentColor" }),
    h("circle", { cx: 3, cy: 8, r: 1.35, fill: "currentColor" }),
    h("circle", { cx: 9, cy: 8, r: 1.35, fill: "currentColor" }),
    h("circle", { cx: 3, cy: 13, r: 1.35, fill: "currentColor" }),
    h("circle", { cx: 9, cy: 13, r: 1.35, fill: "currentColor" })
  );

  function handleListKeyDown(e) {
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
    if (sort.key === sortKey && sort.dir === "asc")
      next = { key: sortKey, dir: "desc" };
    else if (sort.key === sortKey && sort.dir === "desc")
      next = { key: null, dir: null };
    setSort(next);
  }

  function headButton(label, sortKey) {
    const active = sort.key === sortKey;
    const arrow = !active ? "" : sort.dir === "asc" ? " ↑" : " ↓";
    return h(
      "button",
      {
        type: "button",
        className: "mixapp-col-sort" + (active ? " is-active" : ""),
        onClick: (e) => {
          e.stopPropagation();
          cycleSort(sortKey);
        },
        title: MixAppI18n.t("arranger.sortBy", { label }),
      },
      label + arrow
    );
  }

  if (loading) {
    return h(
      "div",
      { className: "mixapp-arranger mixapp-arranger-empty mixapp-empty-state" },
      h("div", {
        className: "mixapp-spinner",
        "aria-hidden": "true",
      }),
      h("p", { className: "mixapp-empty-title" }, MixAppI18n.t("picker.loading")),
      h(
        "p",
        { className: "mixapp-empty-hint" },
        MixAppI18n.t("arranger.loading")
      )
    );
  }

  if (!tracks?.length) {
    return h(
      "div",
      { className: "mixapp-arranger mixapp-arranger-empty mixapp-empty-state" },
      h("p", { className: "mixapp-empty-title" }, MixAppI18n.t("arranger.empty")),
      h("p", { className: "mixapp-empty-hint" }, MixAppI18n.t("arranger.emptyHint"))
    );
  }

  function cell(className, children, style) {
    return h("div", { className, style: style || undefined }, children);
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
      const text = track.bpm != null && track.bpm !== "" ? String(track.bpm) : "—";
      return cell(
        "mixapp-col-feat mixapp-col-bpm",
        h(
          "span",
          {
            className: "mixapp-feat-pill",
            style: { background: MixAppFeatures.featureTint("tempo") },
          },
          text
        )
      );
    }
    const metricId = col.metricId;
    const metric = MixAppFeatures.METRICS.find((m) => m.id === metricId);
    const v = MixAppFeatures.metricValue(track, metric);
    const text = MixAppFeatures.formatMetric(metric, v);
    const bg = MixAppFeatures.featureTint(metricId || col.id);
    return cell(
      "mixapp-col-feat mixapp-col-" + (metricId || col.id.toLowerCase()),
      h(
        "span",
        {
          className: "mixapp-feat-pill",
          style: { background: bg },
        },
        text
      )
    );
  }

  function headCells() {
    const cells = [];
    if (show("INDEX")) {
      cells.push(cell("mixapp-col-num", headButton(MixAppI18n.t("col.index"), "index")));
    }
    if (show("TITLE_AND_ARTIST")) {
      cells.push(cell("mixapp-col-title", headButton(MixAppI18n.t("col.track"), "name")));
    }
    if (show("ADDED_AT")) cells.push(cell("mixapp-col-added", MixAppI18n.t("col.added")));
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
      cells.push(cell("mixapp-col-dur", headButton(MixAppI18n.t("col.time"), "index")));
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
      (track.name || MixAppI18n.t("common.unknown")) +
      (duration && duration !== "—" ? " (" + duration + ")" : "");
    return h(
      "div",
      { className: "mixapp-track-meta" },
      h(
        "button",
        {
          type: "button",
          className: "mixapp-track-meta-title" + (isSeed ? " is-seed" : ""),
          onClick: (e) => {
            e.stopPropagation();
            const di = displayTracks.findIndex(
              (t) => t.uid === track.uid || t.uri === track.uri
            );
            if (di >= 0) selectDisplay(di);
            onToggleSeed?.(track.uri);
          },
          title: isSeed
              ? MixAppI18n.t("arranger.seedUnmark")
              : MixAppI18n.t("arranger.seedMark"),
        },
        titleText
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

  function startTimeLabel(track) {
    const fullIndex = indexInFull(track);
    const startMs = fullIndex >= 0 ? (startOffsetsMs[fullIndex] ?? 0) : 0;
    return MixAppApi.formatDuration(startMs);
  }

  function rowCells(track, index) {
    const cells = [];
    const fullIndex = indexInFull(track);
    if (show("INDEX")) {
      cells.push(
        cell(
          "mixapp-col-num",
          h(
            "div",
            { className: "mixapp-index-cell" },
            h(
              "span",
              {
                className: "mixapp-drag-handle",
                draggable: true,
                title: MixAppI18n.t("arranger.drag"),
                "aria-label": MixAppI18n.t("arranger.drag"),
                onClick: (e) => e.stopPropagation(),
                onDragStart: (e) => {
                  e.stopPropagation();
                  beginRowDrag(e, index);
                },
                onDragEnd: (e) => {
                  e.stopPropagation();
                  clearDrag();
                },
              },
              dragGripIcon
            ),
            h(
              "span",
              { className: "mixapp-index-num" },
              fullIndex >= 0 ? fullIndex + 1 : index + 1
            )
          )
        )
      );
    }
    if (show("TITLE_AND_ARTIST")) {
      const active = !!(track.uri && track.uri === playingUri && isPlaying);
      const playName = track.name || MixAppI18n.t("arranger.trackFallback");
      const playLabel = active
        ? MixAppI18n.t("arranger.pause", { name: playName })
        : MixAppI18n.t("arranger.play", { name: playName });
      cells.push(
        cell(
          "mixapp-col-title",
          h(
            "div",
            { className: "mixapp-title-cell" },
            h(
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
            ),
            trackMetaBox(track)
          )
        )
      );
    }
    if (show("ADDED_AT")) {
      cells.push(
        cell("mixapp-col-added", MixAppColumnConfig.formatAddedAt(track.addedAt))
      );
    }
    for (const col of featureCols) {
      if (show(col.id)) cells.push(featureCell(track, col));
    }
    if (show("DURATION")) {
      const isCurrent = !!(track.uri && track.uri === playingUri);
      cells.push(
        cell("mixapp-col-dur" + (isCurrent ? " is-current" : ""), startTimeLabel(track))
      );
    }
    if (show("ACTIONS")) {
      cells.push(
        cell("mixapp-col-actions", [
          h(
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
              title: MixAppI18n.t("arranger.moveUp"),
            },
            "↑"
          ),
          h(
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
              title: MixAppI18n.t("arranger.moveDown"),
            },
            "↓"
          ),
          h(
            "button",
            {
              key: "remove",
              type: "button",
              className: "mixapp-icon-btn mixapp-icon-btn-danger",
              onClick: (e) => {
                e.stopPropagation();
                removeDisplay(index);
              },
              title: MixAppI18n.t("arranger.remove"),
              "aria-label": MixAppI18n.t("arranger.remove"),
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
              h("path", {
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
    ? h(
        "div",
        {
          ref: menuRef,
          className: "mixapp-column-menu",
          style: { left: menu.x + "px", top: menu.y + "px" },
          role: "menu",
        },
        h("div", { className: "mixapp-column-menu-title" }, "Columns"),
        toggleable.map((col) =>
          h(
            "label",
            {
              key: col.id,
              className: "mixapp-column-menu-item",
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

  // Portal to body so position:fixed tracks the cursor (Spotify ancestors often
  // use transform, which otherwise offsets fixed coordinates).
  const menuPortal =
    columnMenu && Spicetify.ReactDOM?.createPortal
      ? Spicetify.ReactDOM.createPortal(columnMenu, document.body)
      : columnMenu;

  const activeDescendant =
    activeIndex != null ? "mixapp-arranger-row-" + activeIndex : undefined;

  return h(
    "div",
    { className: "mixapp-arranger-wrap" },
    h(
      "div",
      {
        ref: listRef,
        className:
          "mixapp-arranger" +
          (listFlashOn ? " is-flash" : "") +
          (dragIndex != null ? " is-reordering" : ""),
        role: "listbox",
        tabIndex: 0,
        "aria-label": MixAppI18n.t("arranger.aria"),
        "aria-activedescendant": activeDescendant,
        onKeyDown: handleListKeyDown,
      },
      h(
        "div",
        {
          className: "mixapp-arranger-head",
          style: { gridTemplateColumns: gridTemplate },
          onContextMenu: openColumnMenu,
          title: MixAppI18n.t("arranger.columnsMenu"),
          role: "presentation",
        },
        ...headCells()
      ),
      !displayTracks.length
        ? h(
            "div",
            { className: "mixapp-arranger-empty" },
            MixAppI18n.t("arranger.empty")
          )
        : displayTracks.map((track, index) =>
            h(
              "div",
              {
                key: (track.uid || track.uri) + "-" + index,
                id: "mixapp-arranger-row-" + index,
                role: "option",
                "aria-selected": activeIndex === index,
                className:
                  "mixapp-track-row" +
                  (dragIndex === index ? " is-dragging" : "") +
                  (dragOverIndex === index && dragIndex !== index
                    ? " is-drag-over"
                    : "") +
                  (seedSet.has(track.uri) ? " is-seed" : "") +
                  (flashSet.has(track.uid) || flashSet.has(track.uri)
                    ? " is-flash"
                    : "") +
                  (activeIndex === index ? " is-active" : ""),
                style: rowDragStyle(index),
                draggable: false,
                title: seedSet.has(track.uri)
                  ? MixAppI18n.t("arranger.rowSeed")
                  : MixAppI18n.t("arranger.rowNormal"),
                onClick: (e) => {
                  if (
                    e.target?.closest?.(
                      "button, a, input, .mixapp-play-btn, .mixapp-icon-btn, .mixapp-drag-handle, .mixapp-col-sort"
                    )
                  ) {
                    return;
                  }
                  selectDisplay(index);
                  onToggleSeed?.(track.uri);
                },
                onDragOver: (e) => onRowDragOver(e, index),
                onDrop: (e) => finishRowDrop(e, index),
              },
              ...rowCells(track, index)
            )
          )
    ),
    menuPortal
  );
}
