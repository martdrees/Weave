import React from "react";
import { init as initI18n } from "./i18n/index.ts";
import * as Session from "./state/sessionStore.ts";
import {
  usePlaylistSession,
  useRecommendSearch,
  usePlayback,
  usePanelRegistry,
  useAppShortcuts,
  useInitialPrefs,
  usePersistedPrefsSync,
  useSessionPersist,
} from "./hooks/index.ts";
import * as Recommend from "./api/recommend.ts";
import { Header } from "./ui/shared/Header.tsx";
import { Toolbar } from "./ui/Toolbar.tsx";
import { Arranger } from "./ui/Arranger.tsx";
import { SearchPanel } from "./ui/SearchPanel.tsx";
import { SearchResults } from "./ui/SearchResults.tsx";
import { StatsPanel } from "./ui/StatsPanel.tsx";
import { AddTrackModal } from "./ui/AddTrackModal.tsx";
import { CopyPlaylistModal } from "./ui/CopyPlaylistModal.tsx";
import { FlowifyModal } from "./ui/FlowifyModal.tsx";
import { GeneratorModal } from "./ui/GeneratorModal.tsx";
import { ShortcutsHelp } from "./ui/ShortcutsHelp.tsx";
import type { TrackRow } from "./types/track.ts";
import "./css/weave.css";

type SearchCtl = {
  resetForPlaylistLoad: () => void;
  resetForPlaylistClear: () => void;
};

/**
 * Weave editor — Creator Phase 4 composition (parity with legacy WeavePage).
 */
export default function App(): React.ReactElement {
  initI18n();

  const savedSessionRef = React.useRef<ReturnType<typeof Session.load> | false | null>(
    null
  );
  if (savedSessionRef.current === null) {
    savedSessionRef.current = Session.load() || false;
  }
  const saved = savedSessionRef.current || null;
  const prefs = useInitialPrefs();

  const searchCtlRef = React.useRef<SearchCtl>({
    resetForPlaylistLoad() {},
    resetForPlaylistClear() {},
  });

  const session = usePlaylistSession({
    saved,
    onBeforePlaylistLoad() {
      searchCtlRef.current.resetForPlaylistLoad();
    },
    onClearPlaylist() {
      searchCtlRef.current.resetForPlaylistClear();
    },
  });

  const search = useRecommendSearch({
    saved,
    prefs,
    tracks: session.tracks,
  });
  searchCtlRef.current = {
    resetForPlaylistLoad: search.resetForPlaylistLoad,
    resetForPlaylistClear: search.resetForPlaylistClear,
  };

  const playback = usePlayback();

  const panels = usePanelRegistry({
    initialStatsOpen: !!saved?.statsOpen || !!prefs?.preferStatsOpen,
  });

  usePersistedPrefsSync({
    resultLimit: search.resultLimit,
    searchFilters: search.searchFilters,
    searchOpen: search.searchOpen,
    statsOpen: panels.statsOpen,
  });

  useSessionPersist(
    () => ({
      selectedUri: session.selectedUri,
      playlist: session.playlist,
      seedUris: search.seedUris,
      bannedUris: search.bannedUris,
      searchFeatures: search.searchFeatures,
      searchOpen: search.searchOpen,
      statsOpen: panels.statsOpen,
      resultsOpen: search.resultsOpen,
      searchResults: search.searchResults,
    }),
    [
      session.selectedUri,
      session.playlist,
      search.seedUris,
      search.bannedUris,
      search.searchFeatures,
      search.searchOpen,
      panels.statsOpen,
      search.resultsOpen,
      search.searchResults,
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

  useAppShortcuts({
    closeTopOverlay,
    saving: session.saving,
    playlist: session.playlist,
    tracks: session.tracks,
    handleSaveAsNew: session.handleSaveAsNew,
    handleToggleSearch: search.handleToggleSearch,
    openPanel: panels.openPanel,
    togglePanel: panels.togglePanel,
  });

  function handleRemoveTrack(index: number, track: TrackRow) {
    const removed = session.handleRemoveTrack(index, track);
    if (removed?.uri) search.removeSeed(removed.uri);
  }

  function handleAddRecommended(track: TrackRow) {
    if (session.handleAddRecommendedTrack(track) && track?.uri) {
      search.removeResult(track.uri);
    }
  }

  function handlePlay(track: TrackRow, index?: number) {
    playback.handlePlay(track, index, {});
  }

  function handlePlaylistPlay(track: TrackRow, index?: number) {
    playback.handlePlay(track, index, {
      tracks: session.tracks,
      playlistUri: session.playlist?.uri,
      waitForReadyTrack: session.waitForReadyTrack,
      getTracks: session.getTracks,
    });
  }

  return (
    <div className="weave-root">
      <Header onOpenShortcuts={() => panels.openPanel("shortcuts")} />
      <Toolbar
        playlist={session.playlist}
        tracks={session.tracks}
        saving={session.saving}
        searchOpen={search.searchOpen}
        statsOpen={panels.statsOpen}
        seedCount={search.seedUris.length}
        playlists={session.playlists}
        selectedUri={session.selectedUri}
        listLoading={session.listLoading}
        onSelectPlaylist={session.loadPlaylist}
        onRefreshPlaylists={session.refreshPlaylists}
        onSaveAsNew={session.handleSaveAsNew}
        onToggleSearch={search.handleToggleSearch}
        onToggleStats={() => panels.togglePanel("stats")}
        onOpenAddTrack={() => panels.openPanel("addTrack")}
        onOpenCopyPlaylist={() => panels.openPanel("copyPlaylist")}
        onOpenFlowify={() => panels.openPanel("flowify")}
        onOpenGenerator={() => panels.openPanel("generator")}
      />
      <StatsPanel
        open={panels.statsOpen}
        tracks={session.tracks}
        onClose={() => panels.closePanel("stats")}
      />
      <SearchPanel
        open={search.searchOpen}
        seedUris={search.seedUris}
        tracks={session.tracks}
        features={search.searchFeatures}
        filters={search.searchFilters}
        resultLimit={search.resultLimit}
        loading={search.searchLoading}
        fitting={search.searchFitting}
        error={search.searchError}
        onClose={() => {
          search.setSearchOpen(false);
          search.closeResultsPanel();
        }}
        onFeaturesChange={search.setSearchFeatures}
        onFiltersChange={search.setSearchFilters}
        onResultLimitChange={search.setResultLimit}
        onFitToSeeds={search.handleFitToSeeds}
        onResetFeatures={() =>
          search.setSearchFeatures(Recommend.defaultFeatureState())
        }
        onSearch={search.handleSearch}
      />
      {session.error ? <div className="weave-error">{session.error}</div> : null}
      <div className="weave-main">
        <div className="weave-main-arranger">
          <Arranger
            tracks={session.tracks}
            loading={session.tracksLoading}
            playingUri={playback.playingUri}
            isPlaying={playback.isPlaying}
            seedUris={search.seedUris}
            flashUids={session.rowFlashUids}
            listFlashKey={session.listFlashKey}
            isPlayPending={session.isTrackPlayPending}
            onReorder={session.handleReorder}
            onPlay={handlePlaylistPlay}
            onToggleSeed={search.handleToggleSeed}
            onRemove={handleRemoveTrack}
          />
        </div>
      </div>
      <SearchResults
        open={search.resultsOpen}
        results={search.searchResults}
        loading={search.searchLoading}
        playingUri={playback.playingUri}
        isPlaying={playback.isPlaying}
        onClose={search.closeResultsPanel}
        onAddTrack={handleAddRecommended}
        onHideTrack={search.handleHideResult}
        onPlay={handlePlay}
      />
      <AddTrackModal
        open={panels.addTrackOpen}
        playlistTracks={session.tracks}
        playingUri={playback.playingUri}
        isPlaying={playback.isPlaying}
        onClose={() => panels.closePanel("addTrack")}
        onAddTrack={session.handleAddCatalogTrack}
        onAddTracks={session.handleAddCatalogTracks}
        onPlay={handlePlay}
      />
      <CopyPlaylistModal
        open={panels.copyPlaylistOpen}
        libraryPlaylists={session.playlists}
        currentPlaylistUri={session.selectedUri}
        playlistTracks={session.tracks}
        playingUri={playback.playingUri}
        isPlaying={playback.isPlaying}
        onClose={() => panels.closePanel("copyPlaylist")}
        onAddTrack={session.handleAddCatalogTrack}
        onAddTracks={session.handleAddCatalogTracks}
        onPlay={handlePlay}
      />
      <FlowifyModal
        open={panels.flowifyOpen}
        tracks={session.tracks}
        playingUri={playback.playingUri}
        isPlaying={playback.isPlaying}
        onPlay={handlePlay}
        onClose={() => panels.closePanel("flowify")}
        onApply={async (next) => {
          if (!Array.isArray(next) || !next.length) return false;
          return session.handleApplyBulk(next);
        }}
        onSaveAsNew={async (next) => {
          if (!Array.isArray(next) || !next.length) return false;
          return session.handleSaveAsNew({ tracks: next, stayOnCurrent: false });
        }}
      />
      <GeneratorModal
        open={panels.generatorOpen}
        playlist={session.playlist}
        tracks={session.tracks}
        seedUris={search.seedUris}
        playingUri={playback.playingUri}
        isPlaying={playback.isPlaying}
        onPlay={handlePlay}
        onClose={() => panels.closePanel("generator")}
        onCreated={async (uri) => {
          if (!uri) return;
          try {
            await session.refreshPlaylists();
            await session.loadPlaylist(uri);
          } catch (err) {
            console.error(err);
          }
        }}
      />
      <ShortcutsHelp
        open={panels.shortcutsOpen}
        onClose={() => panels.closePanel("shortcuts")}
      />
    </div>
  );
}
