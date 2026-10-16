//@ts-check

function MixAppPlaylistPicker(props) {
  const react = Spicetify.React;
  const {
    playlists,
    selectedUri,
    loading,
    compact,
    onSelect,
    onRefresh,
  } = props;

  return react.createElement(
    "div",
    {
      className:
        "mixapp-picker" + (compact ? " mixapp-picker-compact" : ""),
    },
    compact
      ? null
      : react.createElement(
          "label",
          {
            className: "mixapp-picker-label",
            htmlFor: "mixapp-playlist-select",
          },
          "Playlist"
        ),
    react.createElement(
      "div",
      { className: "mixapp-picker-row" },
      react.createElement(
        "select",
        {
          id: "mixapp-playlist-select",
          className:
            "mixapp-select" + (compact ? " mixapp-select-toolbar" : ""),
          value: selectedUri || "",
          disabled: loading || !playlists?.length,
          onChange: (e) => onSelect(e.target.value || null),
          "aria-label": "Playlist",
          title: "Choose playlist",
        },
        react.createElement(
          "option",
          { value: "" },
          loading
            ? "Loading…"
            : playlists?.length
              ? "Select playlist…"
              : "No playlists"
        ),
        (playlists || []).map((p) =>
          react.createElement(
            "option",
            { key: p.uri, value: p.uri },
            p.name + (p.totalLength != null ? ` (${p.totalLength})` : "")
          )
        )
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: compact
            ? "mixapp-icon-btn mixapp-icon-btn-compact"
            : "mixapp-btn mixapp-btn-ghost",
          onClick: onRefresh,
          disabled: loading,
          title: "Refresh playlist list",
          "aria-label": "Refresh playlist list",
        },
        compact ? "↻" : "Refresh"
      )
    )
  );
}
