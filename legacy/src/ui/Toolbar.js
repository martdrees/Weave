//@ts-check

function WeaveToolbar(props) {
  const t = WeaveI18n.t;
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
    { className: "weave-toolbar" },
    h(
      "div",
      { className: "weave-toolbar-left" },
      h(WeavePlaylistPicker, {
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
            { className: "weave-badge weave-badge-seed" },
            seedCount === 1
              ? t("toolbar.seed", { count: seedCount })
              : t("toolbar.seeds", { count: seedCount })
          )
        : null
    ),
    h(
      "div",
      { className: "weave-toolbar-actions" },
      h(
        "button",
        {
          type: "button",
          className: "weave-btn",
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
          className: "weave-btn" + (searchOpen ? " weave-btn-active" : ""),
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
          className: "weave-btn",
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
          className: "weave-btn",
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
          className: "weave-btn",
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
          className: "weave-btn" + (statsOpen ? " weave-btn-active" : ""),
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
          className: "weave-btn weave-btn-primary",
          onClick: onSaveAsNew,
          disabled: !playlist || !hasTracks || saving,
          title: t("toolbar.saveAsNewTitle"),
        },
        saving ? t("toolbar.saving") : t("toolbar.saveAsNew")
      )
    )
  );
}
