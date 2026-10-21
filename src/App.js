//@ts-check
/**
 * Weave page — composition + layout (R1.1 / R1.3).
 * Use-cases live in src/hooks/*.
 */

function MixAppPage() {
  const react = Spicetify.React;
  MixAppI18n.init();
  const t = MixAppI18n.t;

  const savedSessionRef = react.useRef(null);
  if (savedSessionRef.current === null) {
    savedSessionRef.current = MixAppSession.load() || false;
  }
  const saved = savedSessionRef.current || null;
  const prefs = MixAppUseInitialPrefs();

  const searchCtlRef = react.useRef({
    resetForPlaylistLoad() {},
    resetForPlaylistClear() {},
  });

  const session = MixAppUsePlaylistSession({
    saved,
    onBeforePlaylistLoad() {
      searchCtlRef.current.resetForPlaylistLoad();
    },
    onClearPlaylist() {
      searchCtlRef.current.resetForPlaylistClear();
    },
  });

  const search = MixAppUseRecommendSearch({
    saved,
    prefs,
    tracks: session.tracks,
  });
  searchCtlRef.current = {
    resetForPlaylistLoad: search.resetForPlaylistLoad,
    resetForPlaylistClear: search.resetForPlaylistClear,
  };

  const playback = MixAppUsePlayback();

  const panels = MixAppUsePanelRegistry({
    initialStatsOpen: !!saved?.statsOpen || !!prefs?.preferStatsOpen,
  });

  MixAppUsePersistedPrefsSync({
    resultLimit: search.resultLimit,
    searchFilters: search.searchFilters,
    searchOpen: search.searchOpen,
    statsOpen: panels.statsOpen,
  });

  MixAppUseSessionPersist(
    () => ({
      selectedUri: session.selectedUri,
      playlist: session.playlist,
      tracks: session.tracks,
      dirty: session.dirty,
      seedUris: search.seedUris,
      bannedUris: search.bannedUris,
      searchFeatures: search.searchFeatures,
      searchOpen: search.searchOpen,
      statsOpen: panels.statsOpen,
      resultsOpen: search.resultsOpen,
      searchResults: search.searchResults,
      undo: session.undoRef.current.exportState(),
    }),
    [
      session.selectedUri,
      session.playlist,
      session.tracks,
      session.dirty,
      search.seedUris,
      search.bannedUris,
      search.searchFeatures,
      search.searchOpen,
      panels.statsOpen,
      search.resultsOpen,
      search.searchResults,
      session.canUndo,
      session.canRedo,
    ]
  );

  function closeTopOverlay() {
    return panels.closeTopOverlay({
      resultsOpen: search.resultsOpen,
      searchOpen: search.searchOpen,
      closeResults: search.closeResultsPanel,
      closeSearch: () => search.setSearchOpen(false),
    });
  }

  MixAppUseAppShortcuts({
    closeTopOverlay,
    saving: session.saving,
    playlist: session.playlist,
    tracks: session.tracks,
    handleSave: session.handleSave,
    handleSaveAsNew: session.handleSaveAsNew,
    handleUndo: session.handleUndo,
    handleRedo: session.handleRedo,
    handleToggleSearch: search.handleToggleSearch,
    openPanel: panels.openPanel,
    togglePanel: panels.togglePanel,
  });

  function handleRemoveTrack(index, track) {
    const removed = session.handleRemoveTrack(index, track);
    if (removed?.uri) search.removeSeed(removed.uri);
  }

  function handleAddRecommended(track) {
    if (session.handleAddRecommendedTrack(track) && track?.uri) {
      search.removeResult(track.uri);
    }
  }

  function handlePlay(track, index) {
    playback.handlePlay(track, index, {
      tracks: session.tracks,
      playlistUri: session.playlist?.uri,
    });
  }

  return h(
    "div",
    { className: "mixapp-root" },
    h(
      "header",
      { className: "mixapp-header" },
      h(
        "div",
        { className: "mixapp-header-row" },
        h(
          "div",
          { className: "mixapp-title-group" },
          h(
            "svg",
            {
              className: "mixapp-logo",
              viewBox: "0 0 64 64",
              width: 36,
              height: 36,
              "aria-hidden": "true",
              focusable: "false",
            },
            h("path", {
              d: "M8 42C16 42 18 22 32 22S48 42 56 42",
              fill: "none",
              stroke: "#5F8F7A",
              strokeWidth: 2.5,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            }),
            h("path", {
              d: "M8 22C16 22 18 42 32 42S48 22 56 22",
              fill: "none",
              stroke: "#B8D4C4",
              strokeWidth: 2.5,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            })
          ),
          h(
            "h1",
            { className: "mixapp-title" },
            t("app.name"),
            h("span", { className: "mixapp-title-sep", "aria-hidden": "true" }, "|"),
            h("span", { className: "mixapp-subtitle" }, t("app.subtitle"))
          )
        ),
        h(
          "button",
          {
            type: "button",
            className: "mixapp-icon-btn mixapp-icon-btn-compact",
            onClick: () => panels.openPanel("shortcuts"),
            title: t("app.shortcutsHint"),
            "aria-label": t("app.shortcuts"),
          },
          h(
            "svg",
            {
              viewBox: "0 0 16 16",
              width: 16,
              height: 16,
              "aria-hidden": "true",
              focusable: "false",
            },
            h("path", {
              fill: "currentColor",
              d: "M14 5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h12zM2 4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H2zm2.5 3a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm2 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm2 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm2 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm2 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm-8 2a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm2 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm6 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm-4.5-.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3z",
            })
          )
        )
      )
    ),
    h(MixAppToolbar, {
      playlist: session.playlist,
      tracks: session.tracks,
      dirty: session.dirty,
      canUndo: session.canUndo,
      canRedo: session.canRedo,
      saving: session.saving,
      searchOpen: search.searchOpen,
      statsOpen: panels.statsOpen,
      seedCount: search.seedUris.length,
      playlists: session.playlists,
      selectedUri: session.selectedUri,
      listLoading: session.listLoading,
      onSelectPlaylist: session.loadPlaylist,
      onRefreshPlaylists: session.refreshPlaylists,
      onUndo: session.handleUndo,
      onRedo: session.handleRedo,
      onSave: session.handleSave,
      onSaveAsNew: session.handleSaveAsNew,
      onToggleSearch: search.handleToggleSearch,
      onToggleStats: () => panels.togglePanel("stats"),
      onOpenAddTrack: () => panels.openPanel("addTrack"),
      onOpenCopyPlaylist: () => panels.openPanel("copyPlaylist"),
      onOpenFlowify: () => panels.openPanel("flowify"),
      onOpenGenerator: () => panels.openPanel("generator"),
    }),
    h(MixAppStatsPanel, {
      open: panels.statsOpen,
      tracks: session.tracks,
      onClose: () => panels.closePanel("stats"),
    }),
    h(MixAppSearchPanel, {
      open: search.searchOpen,
      seedUris: search.seedUris,
      tracks: session.tracks,
      features: search.searchFeatures,
      filters: search.searchFilters,
      resultLimit: search.resultLimit,
      loading: search.searchLoading,
      fitting: search.searchFitting,
      error: search.searchError,
      onClose: () => {
        search.setSearchOpen(false);
        search.closeResultsPanel();
      },
      onFeaturesChange: search.setSearchFeatures,
      onFiltersChange: search.setSearchFilters,
      onResultLimitChange: search.setResultLimit,
      onFitToSeeds: search.handleFitToSeeds,
      onResetFeatures: () =>
        search.setSearchFeatures(MixAppRecommend.defaultFeatureState()),
      onSearch: search.handleSearch,
    }),
    session.error ? h("div", { className: "mixapp-error" }, session.error) : null,
    h(
      "div",
      { className: "mixapp-main" },
      h(
        "div",
        { className: "mixapp-main-arranger" },
        h(MixAppArranger, {
          tracks: session.tracks,
          loading: session.tracksLoading,
          playingUri: playback.playingUri,
          isPlaying: playback.isPlaying,
          seedUris: search.seedUris,
          flashUids: session.rowFlashUids,
          listFlashKey: session.listFlashKey,
          onReorder: session.handleReorder,
          onPlay: handlePlay,
          onToggleSeed: search.handleToggleSeed,
          onRemove: handleRemoveTrack,
        })
      )
    ),
    h(MixAppSearchResults, {
      open: search.resultsOpen,
      results: search.searchResults,
      loading: search.searchLoading,
      playingUri: playback.playingUri,
      isPlaying: playback.isPlaying,
      onClose: search.closeResultsPanel,
      onAddTrack: handleAddRecommended,
      onHideTrack: search.handleHideResult,
      onPlay: handlePlay,
    }),
    h(MixAppAddTrackModal, {
      open: panels.addTrackOpen,
      playlistTracks: session.tracks,
      playingUri: playback.playingUri,
      isPlaying: playback.isPlaying,
      onClose: () => panels.closePanel("addTrack"),
      onAddTrack: session.handleAddCatalogTrack,
      onPlay: handlePlay,
    }),
    h(MixAppCopyPlaylistModal, {
      open: panels.copyPlaylistOpen,
      libraryPlaylists: session.playlists,
      currentPlaylistUri: session.selectedUri,
      playlistTracks: session.tracks,
      playingUri: playback.playingUri,
      isPlaying: playback.isPlaying,
      onClose: () => panels.closePanel("copyPlaylist"),
      onAddTrack: session.handleAddCatalogTrack,
      onAddTracks: session.handleAddCatalogTracks,
      onPlay: handlePlay,
    }),
    h(MixAppFlowifyModal, {
      open: panels.flowifyOpen,
      tracks: session.tracks,
      onClose: () => panels.closePanel("flowify"),
      onApply: (next) => {
        if (Array.isArray(next) && next.length) {
          session.commitTracks(next);
          session.flashList();
        }
      },
    }),
    h(MixAppGeneratorModal, {
      open: panels.generatorOpen,
      playlist: session.playlist,
      tracks: session.tracks,
      seedUris: search.seedUris,
      playingUri: playback.playingUri,
      isPlaying: playback.isPlaying,
      onPlay: handlePlay,
      onClose: () => panels.closePanel("generator"),
      onCreated: async (uri) => {
        if (!uri) return;
        try {
          await session.refreshPlaylists();
          await session.loadPlaylist(uri);
        } catch (err) {
          console.error(err);
        }
      },
    }),
    h(MixAppShortcutsHelp, {
      open: panels.shortcutsOpen,
      onClose: () => panels.closePanel("shortcuts"),
    })
  );
}
