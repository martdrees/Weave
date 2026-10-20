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

  return h(
    "div",
    { className: "mixapp-toolbar" },
    h(
      "div",
      { className: "mixapp-toolbar-left" },
      h(MixAppPlaylistPicker, {
        playlists,
        selectedUri,
        loading: listLoading,
        compact: true,
        trackCount: hasTracks ? tracks.length : selectedUri ? 0 : null,
        onSelect: onSelectPlaylist,
        onRefresh: onRefreshPlaylists,
      }),
      dirty ? h("span", { className: "mixapp-badge" }, "Unsaved") : null,
      seedCount > 0
        ? h(
            "span",
            { className: "mixapp-badge mixapp-badge-seed" },
            seedCount + " seed" + (seedCount === 1 ? "" : "s")
          )
        : null
    ),
    h(
      "div",
      { className: "mixapp-toolbar-actions" },
      h(
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
      h(
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
      h(
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
      h(
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
      h(
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
      h(
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
      h(
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
      h(
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
      h(
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
      h(
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
