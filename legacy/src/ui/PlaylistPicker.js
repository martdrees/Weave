//@ts-check

function WeavePlaylistPicker(props) {
  const react = Spicetify.React;
  const t = WeaveI18n.t;
  const { playlists, selectedUri, loading, compact, trackCount, onSelect, onRefresh } =
    props;

  return h(
    "div",
    {
      className: "weave-picker" + (compact ? " weave-picker-compact" : ""),
    },
    compact
      ? null
      : h(
          "label",
          {
            className: "weave-picker-label",
            htmlFor: "weave-playlist-select",
          },
          t("picker.playlist")
        ),
    h(
      "div",
      { className: "weave-picker-row" },
      h(
        "select",
        {
          id: "weave-playlist-select",
          className: "weave-select" + (compact ? " weave-select-toolbar" : ""),
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
              className: "weave-picker-count",
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
            ? "weave-icon-btn weave-icon-btn-compact"
            : "weave-btn weave-btn-ghost",
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
