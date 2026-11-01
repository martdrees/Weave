//@ts-check

function MixAppToolbar(props) {
  const t = MixAppI18n.t;
  const {
    playlist,
    tracks,
    saving,
    searchOpen,
    statsOpen,
    seedCount,
    playlists,
    selectedUri,
    listLoading,
    onSelectPlaylist,
    onRefreshPlaylists,
    onSaveAsNew,
    onToggleSearch,
    onToggleStats,
    onOpenAddTrack,
    onOpenCopyPlaylist,
    onOpenFlowify,
    onOpenGenerator,
  } = props;

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
          className: "mixapp-btn mixapp-btn-primary",
          onClick: onSaveAsNew,
          disabled: !playlist || !hasTracks || saving,
          title: t("toolbar.saveAsNewTitle"),
        },
        saving ? t("toolbar.saving") : t("toolbar.saveAsNew")
      )
    )
  );
}
