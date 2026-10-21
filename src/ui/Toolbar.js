//@ts-check

function MixAppToolbar(props) {
  const react = Spicetify.React;
  const t = MixAppI18n.t;
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
      dirty ? h("span", { className: "mixapp-badge" }, t("toolbar.unsaved")) : null,
      seedCount > 0
        ? h(
            "span",
            { className: "mixapp-badge mixapp-badge-seed" },
            seedCount === 1
              ? t("toolbar.seed", { count: seedCount })
              : t("toolbar.seeds", { count: seedCount })
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
          title: t("toolbar.undo"),
        },
        t("toolbar.undo")
      ),
      h(
        "button",
        {
          type: "button",
          className: "mixapp-btn mixapp-btn-ghost",
          onClick: onRedo,
          disabled: !canRedo || saving,
          title: t("toolbar.redo"),
        },
        t("toolbar.redo")
      ),
      h(
        "button",
        {
          type: "button",
          className: "mixapp-btn",
          onClick: onOpenAddTrack,
          disabled: !hasPlaylist || saving,
          title: t("toolbar.addTrackTitle"),
        },
        t("toolbar.addTrack")
      ),
      h(
        "button",
        {
          type: "button",
          className: "mixapp-btn" + (searchOpen ? " mixapp-btn-active" : ""),
          onClick: onToggleSearch,
          disabled: !hasPlaylist || !hasTracks || saving,
          title: t("toolbar.recommendationsTitle"),
        },
        t("toolbar.recommendations")
      ),
      h(
        "button",
        {
          type: "button",
          className: "mixapp-btn",
          onClick: onOpenCopyPlaylist,
          disabled: !hasPlaylist || saving,
          title: t("toolbar.copyFromPlaylistTitle"),
        },
        t("toolbar.copyFromPlaylist")
      ),
      h(
        "button",
        {
          type: "button",
          className: "mixapp-btn",
          onClick: onOpenFlowify,
          disabled: !hasPlaylist || !hasTracks || saving,
          title: t("toolbar.flowifyTitle"),
        },
        t("toolbar.flowify")
      ),
      h(
        "button",
        {
          type: "button",
          className: "mixapp-btn",
          onClick: onOpenGenerator,
          disabled: !hasPlaylist || !hasTracks || saving,
          title: t("toolbar.generatorTitle"),
        },
        t("toolbar.generator")
      ),
      h(
        "button",
        {
          type: "button",
          className: "mixapp-btn" + (statsOpen ? " mixapp-btn-active" : ""),
          onClick: onToggleStats,
          disabled: !hasPlaylist || !hasTracks,
          title: t("toolbar.statsTitle"),
        },
        t("toolbar.stats")
      ),
      h(
        "button",
        {
          type: "button",
          className: "mixapp-btn",
          onClick: onSave,
          disabled: !playlist || !dirty || saving || !owned,
          title: owned ? t("toolbar.saveTitle") : t("toolbar.saveTitleOwnedOnly"),
        },
        saving ? t("toolbar.saving") : t("toolbar.save")
      ),
      h(
        "button",
        {
          type: "button",
          className: "mixapp-btn mixapp-btn-primary",
          onClick: onSaveAsNew,
          disabled: !playlist || !hasTracks || saving,
          title: t("toolbar.saveAsNewTitle"),
        },
        t("toolbar.saveAsNew")
      )
    )
  );
}
