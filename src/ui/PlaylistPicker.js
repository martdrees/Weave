//@ts-check

function MixAppPlaylistPicker(props) {
  const react = Spicetify.React;
  const { playlists, selectedUri, loading, onSelect, onRefresh } = props;

  return react.createElement(
    "div",
    { className: "mixapp-picker" },
    react.createElement(
      "label",
      { className: "mixapp-picker-label", htmlFor: "mixapp-playlist-select" },
      "Playlist"
    ),
    react.createElement(
      "div",
      { className: "mixapp-picker-row" },
      react.createElement(
        "select",
        {
          id: "mixapp-playlist-select",
          className: "mixapp-select",
          value: selectedUri || "",
          disabled: loading || !playlists?.length,
          onChange: (e) => onSelect(e.target.value || null),
        },
        react.createElement(
          "option",
          { value: "" },
          loading ? "Loading…" : playlists?.length ? "Select a playlist…" : "No playlists found"
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
          className: "mixapp-btn mixapp-btn-ghost",
          onClick: onRefresh,
          disabled: loading,
          title: "Refresh playlist list",
        },
        "Refresh"
      )
    )
  );
}
