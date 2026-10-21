//@ts-check

function MixAppPlaylistPicker(props) {
  const react = Spicetify.React;
  const t = MixAppI18n.t;
  const { playlists, selectedUri, loading, compact, trackCount, onSelect, onRefresh } =
    props;

  return h(
    "div",
    {
      className: "mixapp-picker" + (compact ? " mixapp-picker-compact" : ""),
    },
    compact
      ? null
      : h(
          "label",
          {
            className: "mixapp-picker-label",
            htmlFor: "mixapp-playlist-select",
          },
          t("picker.playlist")
        ),
    h(
      "div",
      { className: "mixapp-picker-row" },
      h(
        "select",
        {
          id: "mixapp-playlist-select",
          className: "mixapp-select" + (compact ? " mixapp-select-toolbar" : ""),
          value: selectedUri || "",
          disabled: loading || !playlists?.length,
          onChange: (e) => onSelect(e.target.value || null),
          "aria-label": t("picker.playlist"),
          title: t("picker.choose"),
        },
        h(
          "option",
          { value: "" },
          loading
            ? t("picker.loading")
            : playlists?.length
              ? t("picker.select")
              : t("picker.empty")
        ),
        (playlists || []).map((p) =>
          h(
            "option",
            { key: p.uri, value: p.uri },
            p.name + (p.totalLength != null ? ` (${p.totalLength})` : "")
          )
        )
      ),
      trackCount != null && selectedUri
        ? h(
            "span",
            {
              className: "mixapp-picker-count",
              title: t("picker.tracks", { count: trackCount }),
            },
            t("picker.tracks", { count: trackCount })
          )
        : null,
      h(
        "button",
        {
          type: "button",
          className: compact
            ? "mixapp-icon-btn mixapp-icon-btn-compact"
            : "mixapp-btn mixapp-btn-ghost",
          onClick: onRefresh,
          disabled: loading,
          title: t("picker.refreshTitle"),
          "aria-label": t("picker.refreshTitle"),
        },
        compact ? "↻" : t("picker.refresh")
      )
    )
  );
}
