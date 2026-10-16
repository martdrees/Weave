//@ts-check

function MixAppToolbar(props) {
  const react = Spicetify.React;
  const {
    playlist,
    tracks,
    dirty,
    canUndo,
    canRedo,
    saving,
    searchOpen,
    statsOpen,
    seedCount,
    playlists,
    selectedUri,
    listLoading,
    onSelectPlaylist,
    onRefreshPlaylists,
    onUndo,
    onRedo,
    onSave,
    onSaveAsNew,
    onToggleSearch,
    onToggleStats,
  } = props;

  const owned = !!(playlist?.isOwnedBySelf || playlist?.collaborative);
  const hasTracks = Array.isArray(tracks) && tracks.length > 0;

  return react.createElement(
    "div",
    { className: "mixapp-toolbar" },
    react.createElement(
      "div",
      { className: "mixapp-toolbar-left" },
      react.createElement(MixAppPlaylistPicker, {
        playlists,
        selectedUri,
        loading: listLoading,
        compact: true,
        onSelect: onSelectPlaylist,
        onRefresh: onRefreshPlaylists,
      }),
      dirty
        ? react.createElement("span", { className: "mixapp-badge" }, "Unsaved")
        : null,
      seedCount > 0
        ? react.createElement(
            "span",
            { className: "mixapp-badge mixapp-badge-seed" },
            seedCount + " seed" + (seedCount === 1 ? "" : "s")
          )
        : null
    ),
    react.createElement(
      "div",
      { className: "mixapp-toolbar-actions" },
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn mixapp-btn-ghost",
          onClick: onUndo,
          disabled: !canUndo || saving,
          title: "Undo",
        },
        "Undo"
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn mixapp-btn-ghost",
          onClick: onRedo,
          disabled: !canRedo || saving,
          title: "Redo",
        },
        "Redo"
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn" + (searchOpen ? " mixapp-btn-active" : ""),
          onClick: onToggleSearch,
          disabled: !playlist || !hasTracks,
          title: "Open search filters",
        },
        searchOpen ? "Close Search" : "Open Search"
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn" + (statsOpen ? " mixapp-btn-active" : ""),
          onClick: onToggleStats,
          disabled: !playlist || !hasTracks,
          title: "Feature charts and summary",
        },
        statsOpen ? "Hide Stats" : "Stats"
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn",
          onClick: onSave,
          disabled: !playlist || !dirty || saving || !owned,
          title: owned
            ? "Overwrite playlist with current order"
            : "You can only overwrite playlists you own",
        },
        saving ? "Saving…" : "Save"
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn mixapp-btn-primary",
          onClick: onSaveAsNew,
          disabled: !playlist || !hasTracks || saving,
          title: "Create a new playlist with the current track list",
        },
        "Save as new"
      )
    )
  );
}
