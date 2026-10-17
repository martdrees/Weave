//@ts-check

/** Phase 7 — keyboard shortcuts overlay. */
function MixAppShortcutsHelp(props) {
  const react = Spicetify.React;
  const { open, onClose } = props;

  react.useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

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
    ["?", "Show this help"],
    ["Esc", "Close top panel / modal"],
  ];

  return react.createElement(
    "div",
    {
      className: "mixapp-results-overlay",
      role: "presentation",
      onClick: (e) => {
        if (e.target === e.currentTarget) onClose?.();
      },
    },
    react.createElement(
      "div",
      {
        className: "mixapp-results-modal mixapp-find-modal mixapp-shortcuts-modal",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Keyboard shortcuts",
      },
      react.createElement(
        "div",
        { className: "mixapp-recommend-header" },
        react.createElement("h2", null, "Keyboard shortcuts"),
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
        "div",
        { className: "mixapp-shortcuts-body" },
        react.createElement(
          "table",
          { className: "mixapp-shortcuts-table" },
          react.createElement(
            "tbody",
            null,
            rows.map(([keys, action]) =>
              react.createElement(
                "tr",
                { key: keys },
                react.createElement("td", { className: "mixapp-shortcuts-keys" }, keys),
                react.createElement("td", null, action)
              )
            )
          )
        ),
        react.createElement(
          "p",
          { className: "mixapp-recommend-meta" },
          "Shortcuts are ignored while typing in inputs (except Save)."
        )
      )
    )
  );
}
