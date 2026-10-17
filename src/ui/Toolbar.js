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
    onOpenAddTrack,
    onOpenCopyPlaylist,
    onOpenFlowify,
    onOpenGenerator,
  } = props;

  const owned = !!(playlist?.isOwnedBySelf || playlist?.collaborative);
  const hasTracks = Array.isArray(tracks) && tracks.length > 0;
  const hasPlaylist = !!playlist;

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
        trackCount: hasTracks ? tracks.length : selectedUri ? 0 : null,
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
          className: "mixapp-btn",
          onClick: onOpenAddTrack,
          disabled: !hasPlaylist || saving,
          title: "Search Spotify and add a track",
        },
        "Add Track"
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn" + (searchOpen ? " mixapp-btn-active" : ""),
          onClick: onToggleSearch,
          disabled: !hasPlaylist || !hasTracks || saving,
          title: "Recommend tracks from seeds / feature ranges",
        },
        "Recommendations"
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn",
          onClick: onOpenCopyPlaylist,
          disabled: !hasPlaylist || saving,
          title: "Copy tracks from another playlist",
        },
        "Copy from Playlist"
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn",
          onClick: onOpenFlowify,
          disabled: !hasPlaylist || !hasTracks || saving,
          title: "Auto-arrange playlist (curves / sets)",
        },
        "Flowify"
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn",
          onClick: onOpenGenerator,
          disabled: !hasPlaylist || !hasTracks || saving,
          title: "Generate a new playlist from seeds",
        },
        "Generator"
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn" + (statsOpen ? " mixapp-btn-active" : ""),
          onClick: onToggleStats,
          disabled: !hasPlaylist || !hasTracks,
          title: "Feature charts and summary",
        },
        "Stats"
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
