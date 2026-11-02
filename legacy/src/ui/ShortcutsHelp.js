//@ts-check

/** Phase 7 — keyboard shortcuts overlay. */
function WeaveShortcutsHelp(props) {
  const react = Spicetify.React;
  const t = WeaveI18n.t;
  const { open, onClose } = props;

  const rows = [
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
    WeaveModal,
    {
      open,
      title: t("shortcuts.title"),
      onClose,
      ariaLabel: t("shortcuts.title"),
      className: "weave-find-modal weave-shortcuts-modal",
    },
    h(
      "div",
      { className: "weave-shortcuts-body" },
      h(
        "table",
        { className: "weave-shortcuts-table" },
        h(
          "tbody",
          null,
          rows.map(([keys, action]) =>
            h(
              "tr",
              { key: keys },
              h("td", { className: "weave-shortcuts-keys" }, keys),
              h("td", null, action)
            )
          )
        )
      ),
      h("p", { className: "weave-recommend-meta" }, t("shortcuts.note"))
    )
  );
}
