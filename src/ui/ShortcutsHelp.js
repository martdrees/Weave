//@ts-check

/** Phase 7 — keyboard shortcuts overlay. */
function MixAppShortcutsHelp(props) {
  const react = Spicetify.React;
  const t = MixAppI18n.t;
  const { open, onClose } = props;

  const rows = [
    ["Ctrl/⌘ + Z", t("shortcuts.undo")],
    ["Ctrl/⌘ + Shift + Z / Y", t("shortcuts.redo")],
    ["Ctrl/⌘ + S", t("shortcuts.save")],
    ["Ctrl/⌘ + Shift + S", t("shortcuts.saveAsNew")],
    ["Ctrl/⌘ + F", t("shortcuts.toggleRecs")],
    ["Ctrl/⌘ + Shift + A", t("shortcuts.addTrack")],
    ["Ctrl/⌘ + Shift + C", t("shortcuts.copy")],
    ["Ctrl/⌘ + Shift + F", t("shortcuts.flowify")],
    ["Ctrl/⌘ + Shift + G", t("shortcuts.generator")],
    ["Ctrl/⌘ + Shift + T", t("shortcuts.toggleStats")],
    ["↑ / ↓", t("shortcuts.selectTrack")],
    ["Alt + ↑ / ↓", t("shortcuts.moveTrack")],
    ["Home / End", t("shortcuts.firstLast")],
    ["Delete", t("shortcuts.removeTrack")],
    ["?", t("shortcuts.showHelp")],
    ["Esc", t("shortcuts.close")],
  ];

  return h(
    MixAppModal,
    {
      open,
      title: t("shortcuts.title"),
      onClose,
      ariaLabel: t("shortcuts.title"),
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
      h("p", { className: "mixapp-recommend-meta" }, t("shortcuts.note"))
    )
  );
}
