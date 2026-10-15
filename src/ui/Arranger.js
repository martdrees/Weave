//@ts-check

function MixAppArranger(props) {
  const react = Spicetify.React;
  const { tracks, loading, onReorder, onPlay } = props;
  const [dragIndex, setDragIndex] = react.useState(null);
  const [visibility, setVisibility] = react.useState(() =>
    MixAppColumnConfig.getVisibility()
  );
  const [menu, setMenu] = react.useState(null); // { x, y } | null
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

  const gridTemplate = [
    show("INDEX") ? "48px" : null,
    show("TITLE_AND_ARTIST") ? "minmax(160px, 2.2fr)" : null,
    show("TITLE_AND_ARTIST") ? "minmax(120px, 1.4fr)" : null,
    show("ALBUM") ? "minmax(100px, 1.2fr)" : null,
    show("ADDED_AT") ? "minmax(100px, 0.9fr)" : null,
    show("BPM") ? "56px" : null,
    show("KEY") ? "56px" : null,
    show("DURATION") ? "64px" : null,
    show("ACTIONS") ? "64px" : null,
  ]
    .filter(Boolean)
    .join(" ");

  function move(from, to) {
    if (from == null || to == null || from === to) return;
    if (to < 0 || to >= tracks.length) return;
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

  function cell(className, children) {
    return react.createElement("div", { className }, children);
  }

  function headCells() {
    const cells = [];
    if (show("INDEX")) cells.push(cell("mixapp-col-num", "#"));
    if (show("TITLE_AND_ARTIST")) {
      cells.push(cell("mixapp-col-title", "Title"));
      cells.push(cell("mixapp-col-artist", "Artists"));
    }
    if (show("ALBUM")) cells.push(cell("mixapp-col-album", "Album"));
    if (show("ADDED_AT")) cells.push(cell("mixapp-col-added", "Date added"));
    if (show("BPM")) cells.push(cell("mixapp-col-bpm", "BPM"));
    if (show("KEY")) cells.push(cell("mixapp-col-key", "Key"));
    if (show("DURATION")) cells.push(cell("mixapp-col-dur", "Time"));
    if (show("ACTIONS")) cells.push(cell("mixapp-col-actions", ""));
    return cells;
  }

  function rowCells(track, index) {
    const cells = [];
    if (show("INDEX")) {
      cells.push(
        cell(
          "mixapp-col-num mixapp-drag-handle",
          react.createElement(
            "span",
            { title: "Drag to reorder" },
            index + 1
          )
        )
      );
    }
    if (show("TITLE_AND_ARTIST")) {
      cells.push(
        cell(
          "mixapp-col-title",
          react.createElement(
            "button",
            {
              type: "button",
              className: "mixapp-linkish",
              onClick: () => onPlay?.(track, index),
              title: "Play from here",
            },
            track.name
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
    if (show("BPM")) {
      cells.push(
        cell(
          "mixapp-col-bpm",
          track.bpm != null && track.bpm !== "" ? String(track.bpm) : "—"
        )
      );
    }
    if (show("KEY")) {
      cells.push(cell("mixapp-col-key", track.key || "—"));
    }
    if (show("DURATION")) {
      cells.push(
        cell("mixapp-col-dur", MixAppApi.formatDuration(track.durationMs))
      );
    }
    if (show("ACTIONS")) {
      cells.push(
        cell(
          "mixapp-col-actions",
          [
            react.createElement(
              "button",
              {
                key: "up",
                type: "button",
                className: "mixapp-icon-btn",
                disabled: index === 0,
                onClick: () => move(index, index - 1),
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
                disabled: index >= tracks.length - 1,
                onClick: () => move(index, index + 1),
                title: "Move down",
              },
              "↓"
            ),
          ]
        )
      );
    }
    return cells;
  }

  return react.createElement(
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
    tracks.map((track, index) =>
      react.createElement(
        "div",
        {
          key: `${track.uid}-${index}`,
          className:
            "mixapp-track-row" + (dragIndex === index ? " is-dragging" : ""),
          style: { gridTemplateColumns: gridTemplate },
          draggable: true,
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
            move(from, index);
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
  );
}
