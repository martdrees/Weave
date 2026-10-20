//@ts-check

function MixAppPlaylistPicker(props) {
  const react = Spicetify.React;
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
          "Playlist"
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
          "aria-label": "Playlist",
          title: "Choose playlist",
        },
        h(
          "option",
          { value: "" },
          loading ? "Loading…" : playlists?.length ? "Select playlist…" : "No playlists"
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
              title: trackCount + " tracks",
            },
            trackCount + " tracks"
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
          title: "Refresh playlist list",
          "aria-label": "Refresh playlist list",
        },
        compact ? "↻" : "Refresh"
      )
    )
  );
}
