//@ts-check

/** Phase 7 — keyboard shortcuts overlay. */
function MixAppShortcutsHelp(props) {
  const react = Spicetify.React;
  const { open, onClose } = props;

  const rows = [
    ["Ctrl/⌘ + Z", "Undo"],
    ["Ctrl/⌘ + Shift + Z / Y", "Redo"],
    ["Ctrl/⌘ + S", "Save playlist"],
    ["Ctrl/⌘ + Shift + S", "Save as new"],
    ["Ctrl/⌘ + F", "Toggle recommendations"],
    ["Ctrl/⌘ + Shift + A", "Add track"],
    ["Ctrl/⌘ + Shift + C", "Copy from playlist"],
    ["Ctrl/⌘ + Shift + F", "Flowify"],
    ["Ctrl/⌘ + Shift + G", "Generator"],
    ["Ctrl/⌘ + Shift + T", "Toggle stats"],
    ["↑ / ↓", "Select track in arranger (click list first)"],
    ["Alt + ↑ / ↓", "Move selected track"],
    ["Home / End", "First / last track"],
    ["Delete", "Remove selected track"],
    ["?", "Show this help"],
    ["Esc", "Close top panel / modal"],
  ];

  return h(
    MixAppModal,
    {
      open,
      title: "Keyboard shortcuts",
      onClose,
      ariaLabel: "Keyboard shortcuts",
      className: "mixapp-find-modal mixapp-shortcuts-modal",
    },
    h(
      "div",
      { className: "mixapp-shortcuts-body" },
      h(
        "table",
        { className: "mixapp-shortcuts-table" },
        h(
          "tbody",
          null,
          rows.map(([keys, action]) =>
            h(
              "tr",
              { key: keys },
              h("td", { className: "mixapp-shortcuts-keys" }, keys),
              h("td", null, action)
            )
          )
        )
      ),
      h(
        "p",
        { className: "mixapp-recommend-meta" },
        "Shortcuts are ignored while typing in inputs (except Save)."
      )
    )
  );
}
