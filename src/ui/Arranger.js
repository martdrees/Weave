//@ts-check

function MixAppArranger(props) {
  const react = Spicetify.React;
  const {
    tracks,
    loading,
    playingUri,
    isPlaying,
    seedUris,
    filters,
    onFiltersChange,
    onReorder,
    onPlay,
    onToggleSeed,
  } = props;
  const seedSet = new Set(seedUris || []);
  const [dragIndex, setDragIndex] = react.useState(null);
  const [visibility, setVisibility] = react.useState(() =>
    MixAppColumnConfig.getVisibility()
  );
  const [menu, setMenu] = react.useState(null);
  const [sort, setSort] = react.useState({ key: null, dir: null });
  const [filtersOpen, setFiltersOpen] = react.useState(false);
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

  const show = (id) => MixAppColumnConfig.isVisible(visibility, id);
  const toggleable = MixAppColumnConfig.COLUMNS.filter((c) => !c.always);

  const featureCols = [
    { id: "BPM", label: "BPM", sortKey: "bpm", width: "52px" },
    { id: "KEY", label: "Key", sortKey: "key", width: "64px" },
    { id: "ENERGY", label: "Energy", sortKey: "energy", width: "64px", metricId: "energy" },
    { id: "DANCEABILITY", label: "Dance", sortKey: "danceability", width: "64px", metricId: "danceability" },
    { id: "VALENCE", label: "Valence", sortKey: "valence", width: "64px", metricId: "valence" },
    { id: "ACOUSTICNESS", label: "Acoustic", sortKey: "acousticness", width: "64px", metricId: "acousticness" },
  ];

  const gridTemplate = [
    show("INDEX") ? "48px" : null,
    show("TITLE_AND_ARTIST") ? "minmax(140px, 2fr)" : null,
    show("TITLE_AND_ARTIST") ? "minmax(100px, 1.2fr)" : null,
    show("ALBUM") ? "minmax(90px, 1fr)" : null,
    show("ADDED_AT") ? "minmax(90px, 0.8fr)" : null,
    ...featureCols.map((c) => (show(c.id) ? c.width : null)),
    show("DURATION") ? "56px" : null,
    show("ACTIONS") ? "64px" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const filtered = MixAppFeatures.filterTracks(tracks, filters);
  const displayTracks =
    sort.key && sort.dir
      ? MixAppFeatures.sortTracks(filtered, sort.key, sort.dir)
      : filtered;

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
        track.key || "—",
        bg ? { background: bg } : null
      );
    }
    const metricId = col.metricId || (col.id === "BPM" ? "tempo" : null);
    const metric = MixAppFeatures.METRICS.find((m) => m.id === metricId);
    const range = metricRanges[metricId];
    const v = MixAppFeatures.metricValue(track, metric);
    const text =
      col.id === "BPM"
        ? track.bpm != null && track.bpm !== ""
          ? String(track.bpm)
          : "—"
        : MixAppFeatures.formatMetric(metric, v);
    const norm = MixAppFeatures.relativeNorm(v, range?.min, range?.max);
    const bg = MixAppFeatures.relativeColor(norm);
    return cell(
      "mixapp-col-feat mixapp-col-" + (metricId || col.id.toLowerCase()),
      text,
      bg ? { background: bg } : null
    );
  }

  function headCells() {
    const cells = [];
    if (show("INDEX")) cells.push(cell("mixapp-col-num", "#"));
    if (show("TITLE_AND_ARTIST")) {
      cells.push(cell("mixapp-col-title", headButton("Title", "name")));
      cells.push(cell("mixapp-col-artist", headButton("Artists", "artists")));
    }
    if (show("ALBUM")) cells.push(cell("mixapp-col-album", headButton("Album", "album")));
    if (show("ADDED_AT")) cells.push(cell("mixapp-col-added", "Date added"));
    for (const col of featureCols) {
      if (show(col.id)) {
        cells.push(
          cell("mixapp-col-feat", headButton(col.label, col.sortKey))
        );
      }
    }
    if (show("DURATION")) {
      cells.push(cell("mixapp-col-dur", headButton("Time", "duration")));
    }
    if (show("ACTIONS")) cells.push(cell("mixapp-col-actions", ""));
    return cells;
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
            react.createElement(
              "button",
              {
                type: "button",
                className:
                  "mixapp-linkish" + (seedSet.has(track.uri) ? " is-seed" : ""),
                onClick: (e) => {
                  e.stopPropagation();
                  onToggleSeed?.(track.uri);
                },
                title: seedSet.has(track.uri)
                  ? "Remove seed"
                  : "Mark as seed track",
              },
              track.name
            )
          )
        )
      );
      cells.push(cell("mixapp-col-artist", track.artists || "—"));
    }
    if (show("ALBUM")) cells.push(cell("mixapp-col-album", track.album || "—"));
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
      cells.push(
        cell("mixapp-col-dur", MixAppApi.formatDuration(track.durationMs))
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
              onClick: () => moveDisplay(index, index - 1),
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
              onClick: () => moveDisplay(index, index + 1),
              title: "Move down",
            },
            "↓"
          ),
        ])
      );
    }
    return cells;
  }

  function filterField(label, key, placeholder, step) {
    return react.createElement(
      "label",
      { className: "mixapp-feature-field" },
      label,
      react.createElement("input", {
        type: key === "query" || key === "keyQuery" ? "text" : "number",
        placeholder: placeholder || "",
        step: step || undefined,
        value: filters?.[key] ?? "",
        onChange: (e) =>
          onFiltersChange?.({ ...(filters || {}), [key]: e.target.value }),
      })
    );
  }

  const filterBar = react.createElement(
    "div",
    { className: "mixapp-arranger-toolbar" },
    react.createElement(
      "button",
      {
        type: "button",
        className:
          "mixapp-btn mixapp-btn-ghost" +
          (filtersOpen || MixAppFeatures.filtersActive(filters)
            ? " mixapp-btn-active"
            : ""),
        onClick: () => setFiltersOpen((v) => !v),
      },
      filtersOpen ? "Hide filters" : "Show filters"
    ),
    react.createElement(
      "span",
      { className: "mixapp-recommend-meta" },
      displayTracks.length === tracks.length
        ? tracks.length + " tracks"
        : displayTracks.length + " of " + tracks.length + " tracks",
      MixAppFeatures.filtersActive(filters) ? " · filtered" : "",
      sort.key ? " · sorted by " + sort.key : ""
    ),
    MixAppFeatures.filtersActive(filters)
      ? react.createElement(
          "button",
          {
            type: "button",
            className: "mixapp-btn mixapp-btn-ghost",
            onClick: () =>
              onFiltersChange?.(MixAppFeatures.defaultArrangerFilters()),
          },
          "Clear filters"
        )
      : null
  );

  const filterPanel = filtersOpen
    ? react.createElement(
        "div",
        { className: "mixapp-arranger-filters" },
        filterField("Search", "query", "title, artist, album"),
        filterField("Key", "keyQuery", "e.g. 8A"),
        filterField("BPM min", "bpmMin", "80"),
        filterField("BPM max", "bpmMax", "140"),
        filterField("Energy min", "energyMin", "0", "0.01"),
        filterField("Energy max", "energyMax", "1", "0.01"),
        filterField("Valence min", "valenceMin", "0", "0.01"),
        filterField("Valence max", "valenceMax", "1", "0.01")
      )
    : null;

  return react.createElement(
    "div",
    { className: "mixapp-arranger-wrap" },
    filterBar,
    filterPanel,
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
            "No tracks match the current filters."
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
          ),
      menu
        ? react.createElement(
            "div",
            {
              ref: menuRef,
              className: "mixapp-column-menu",
              style: { left: menu.x, top: menu.y },
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
                },
                react.createElement("input", {
                  type: "checkbox",
                  checked: show(col.id),
                  onChange: () => handleToggleColumn(col.id),
                }),
                react.createElement("span", null, col.label)
              )
            )
          )
        : null
    )
  );
}
