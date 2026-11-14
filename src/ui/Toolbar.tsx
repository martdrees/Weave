import React from "react";
import { t } from "../i18n/index.ts";
import type { TrackRow } from "../types/track.ts";
import { PlaylistPicker, type PlaylistOption } from "./PlaylistPicker.tsx";

export type ToolbarProps = {
  playlist?: { uri?: string; name?: string } | null;
  tracks?: TrackRow[] | null;
  saving?: boolean;
  searchOpen?: boolean;
  statsOpen?: boolean;
  seedCount?: number;
  playlists?: PlaylistOption[] | null;
  selectedUri?: string | null;
  listLoading?: boolean;
  onSelectPlaylist?: (uri: string | null) => void;
  onRefreshPlaylists?: () => void;
  onSaveAsNew?: () => void;
  onToggleSearch?: () => void;
  onToggleStats?: () => void;
  onOpenAddTrack?: () => void;
  onOpenCopyPlaylist?: () => void;
  onOpenFlowify?: () => void;
  onOpenGenerator?: () => void;
};

export function Toolbar(props: ToolbarProps): React.ReactElement {
  const {
    playlist,
    tracks,
    saving,
    searchOpen,
    statsOpen,
    seedCount = 0,
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

  return (
    <div className="weave-toolbar">
      <div className="weave-toolbar-left">
        <PlaylistPicker
          playlists={playlists}
          selectedUri={selectedUri}
          loading={listLoading}
          compact
          trackCount={hasTracks ? tracks.length : selectedUri ? 0 : null}
          onSelect={onSelectPlaylist}
          onRefresh={onRefreshPlaylists}
        />
        {seedCount > 0 ? (
          <span className="weave-badge weave-badge-seed">
            {seedCount === 1
              ? t("toolbar.seed", { count: seedCount })
              : t("toolbar.seeds", { count: seedCount })}
          </span>
        ) : null}
      </div>
      <div className="weave-toolbar-actions">
        <button
          type="button"
          className="weave-btn"
          onClick={onOpenAddTrack}
          disabled={!hasPlaylist || saving}
          title={t("toolbar.addTrackTitle")}
        >
          {t("toolbar.addTrack")}
        </button>
        <button
          type="button"
          className={"weave-btn" + (searchOpen ? " weave-btn-active" : "")}
          onClick={onToggleSearch}
          disabled={!hasPlaylist || !hasTracks || saving}
          title={t("toolbar.recommendationsTitle")}
        >
          {t("toolbar.recommendations")}
        </button>
        <button
          type="button"
          className="weave-btn"
          onClick={onOpenCopyPlaylist}
          disabled={!hasPlaylist || saving}
          title={t("toolbar.copyFromPlaylistTitle")}
        >
          {t("toolbar.copyFromPlaylist")}
        </button>
        <button
          type="button"
          className="weave-btn"
          onClick={onOpenFlowify}
          disabled={!hasPlaylist || !hasTracks || saving}
          title={t("toolbar.flowifyTitle")}
        >
          {t("toolbar.flowify")}
        </button>
        <button
          type="button"
          className="weave-btn"
          onClick={onOpenGenerator}
          disabled={!hasPlaylist || !hasTracks || saving}
          title={t("toolbar.generatorTitle")}
        >
          {t("toolbar.generator")}
        </button>
        <button
          type="button"
          className={"weave-btn" + (statsOpen ? " weave-btn-active" : "")}
          onClick={onToggleStats}
          disabled={!hasPlaylist || !hasTracks}
          title={t("toolbar.statsTitle")}
        >
          {t("toolbar.stats")}
        </button>
        <button
          type="button"
          className="weave-btn weave-btn-primary"
          onClick={onSaveAsNew}
          disabled={!playlist || !hasTracks || saving}
          title={t("toolbar.saveAsNewTitle")}
        >
          {saving ? t("toolbar.saving") : t("toolbar.saveAsNew")}
        </button>
      </div>
    </div>
  );
}
