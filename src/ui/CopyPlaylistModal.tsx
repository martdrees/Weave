/** Phase 5 — MixMoose "Copy from Playlist": import tracks from another list. */

import React from "react";
import { t } from "../i18n/index.ts";
import { api as WeaveApi } from "../api/spotify.ts";
import * as Features from "../api/features.ts";
import * as PlaylistOps from "../domain/playlistOps.ts";
import type { TrackRow } from "../types/track.ts";
import { Modal } from "./Modal.tsx";
import { PlayButton } from "./shared/PlayButton.tsx";
import { FeatureCells } from "./shared/FeatureCells.tsx";

type PlaylistOption = {
  uri: string;
  name?: string;
  totalLength?: number | null;
  ownerName?: string;
};

export type CopyPlaylistModalProps = {
  open: boolean;
  libraryPlaylists?: PlaylistOption[] | null;
  currentPlaylistUri?: string | null;
  playlistTracks?: TrackRow[] | null;
  playingUri?: string | null;
  isPlaying?: boolean;
  onClose?: () => void;
  onAddTrack?: (track: TrackRow) => void;
  onAddTracks?: (tracks: TrackRow[]) => void;
  onPlay?: (track: TrackRow, index?: number) => void;
};

const KEY_COL = { id: "KEY", always: true } as const;

export function CopyPlaylistModal(
  props: CopyPlaylistModalProps
): React.ReactElement | null {
  const {
    open,
    libraryPlaylists,
    currentPlaylistUri,
    playlistTracks,
    playingUri,
    isPlaying,
    onClose,
    onAddTrack,
    onAddTracks,
    onPlay,
  } = props;

  const [mode, setMode] = React.useState<"library" | "search">("library");
  const [query, setQuery] = React.useState("");
  const [searchHits, setSearchHits] = React.useState<PlaylistOption[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [selectedUri, setSelectedUri] = React.useState<string | null>(null);
  const [sourceName, setSourceName] = React.useState("");
  const [sourceTracks, setSourceTracks] = React.useState<TrackRow[]>([]);
  const [tracksLoading, setTracksLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [error, setError] = React.useState<string | null>(null);
  const genRef = React.useRef(0);

  const existingIndex = React.useMemo(
    () => PlaylistOps.buildExistingIndex(playlistTracks || []),
    [playlistTracks]
  );

  React.useEffect(() => {
    if (!open) {
      genRef.current += 1;
      setMode("library");
      setQuery("");
      setSearchHits([]);
      setSelectedUri(null);
      setSourceName("");
      setSourceTracks([]);
      setSelected(new Set());
      setError(null);
      setSearchLoading(false);
      setTracksLoading(false);
    }
  }, [open]);

  function isInPlaylist(track: TrackRow): boolean {
    return PlaylistOps.isInIndex(existingIndex, track);
  }

  const libraryOptions = (libraryPlaylists || []).filter(
    (p) => p?.uri && p.uri !== currentPlaylistUri
  );

  async function runPlaylistSearch(e?: React.FormEvent): Promise<void> {
    e?.preventDefault?.();
    const q = String(query || "").trim();
    if (!q) return;
    const gen = ++genRef.current;
    setSearchLoading(true);
    setError(null);
    try {
      const hits = await WeaveApi.searchPlaylists(q, { limit: 20 });
      if (gen !== genRef.current) return;
      setSearchHits(hits.filter((p) => p.uri !== currentPlaylistUri));
      if (!hits.length) setError(t("picker.empty"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setSearchHits([]);
      setError(err instanceof Error ? err.message : t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setSearchLoading(false);
    }
  }

  async function loadSource(pl: PlaylistOption): Promise<void> {
    if (!pl?.uri) return;
    const gen = ++genRef.current;
    setSelectedUri(pl.uri);
    setSourceName(pl.name || t("picker.playlist"));
    setSourceTracks([]);
    setSelected(new Set());
    setTracksLoading(true);
    setError(null);
    try {
      let items = await WeaveApi.getPlaylistTracks(pl.uri);
      if (gen !== genRef.current) return;
      if (items.length) {
        try {
          const enriched = await Features.enrichTracks(items.slice());
          items = (enriched as TrackRow[] | undefined) || items;
        } catch (enrichErr) {
          console.warn("Weave: copy-playlist enrich failed", enrichErr);
        }
      }
      if (gen !== genRef.current) return;
      setSourceTracks(items);
      if (!items.length) setError(t("results.empty"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setSourceTracks([]);
      setError(err instanceof Error ? err.message : t("notify.failedPlaylist"));
    } finally {
      if (gen === genRef.current) setTracksLoading(false);
    }
  }

  function toggleSelect(uri: string | undefined): void {
    if (!uri) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }

  function selectAddable(): void {
    const next = new Set<string>();
    for (const tr of sourceTracks) {
      if (tr?.uri && !isInPlaylist(tr)) next.add(tr.uri);
    }
    setSelected(next);
  }

  function clearSelection(): void {
    setSelected(new Set());
  }

  function addSelected(): void {
    const batch = sourceTracks.filter(
      (tr) => tr?.uri && selected.has(tr.uri) && !isInPlaylist(tr)
    );
    if (!batch.length) {
      WeaveApi.notify(t("copy.noSelection"), true);
      return;
    }
    onAddTracks?.(batch);
    setSelected(new Set());
  }

  function addAllNew(): void {
    const batch = sourceTracks.filter((tr) => tr?.uri && !isInPlaylist(tr));
    if (!batch.length) {
      WeaveApi.notify(t("copy.allExist"), true);
      return;
    }
    onAddTracks?.(batch);
    setSelected(new Set());
  }

  const playlistList = mode === "library" ? libraryOptions : searchHits;

  return (
    <Modal
      open={open}
      title={t("copy.title")}
      onClose={onClose}
      ariaLabel={t("copy.title")}
      className="weave-find-modal weave-copy-modal"
    >
      <div className="weave-copy-layout">
        <aside className="weave-copy-sidebar">
          <div className="weave-copy-tabs">
            <button
              type="button"
              className={
                "weave-btn weave-btn-ghost" +
                (mode === "library" ? " weave-btn-active" : "")
              }
              onClick={() => setMode("library")}
            >
              Your library
            </button>
            <button
              type="button"
              className={
                "weave-btn weave-btn-ghost" +
                (mode === "search" ? " weave-btn-active" : "")
              }
              onClick={() => setMode("search")}
            >
              {t("common.search")}
            </button>
          </div>
          {mode === "search" ? (
            <form
              className="weave-find-search-bar weave-find-search-bar-stack"
              onSubmit={runPlaylistSearch}
            >
              <input
                type="search"
                className="weave-find-input"
                placeholder={t("copy.placeholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="submit"
                className="weave-btn weave-btn-primary"
                disabled={searchLoading || !String(query || "").trim()}
              >
                {searchLoading ? "…" : "Search"}
              </button>
            </form>
          ) : null}
          <div className="weave-copy-playlist-list">
            {!playlistList.length ? (
              <div className="weave-recommend-meta">
                {mode === "library"
                  ? "No other playlists in your library."
                  : "Search for a playlist to copy from."}
              </div>
            ) : (
              playlistList.map((pl) => (
                <button
                  key={pl.uri}
                  type="button"
                  className={
                    "weave-copy-playlist-item" +
                    (selectedUri === pl.uri ? " is-active" : "")
                  }
                  onClick={() => void loadSource(pl)}
                >
                  <span className="weave-copy-playlist-name">{pl.name}</span>
                  <span className="weave-recommend-meta">
                    {pl.totalLength != null
                      ? t("picker.tracks", { count: pl.totalLength })
                      : pl.ownerName || ""}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>
        <section className="weave-copy-main">
          <div className="weave-copy-main-head">
            <div className="weave-search-panel-title-row">
              <h3>{sourceName || t("picker.select")}</h3>
              {sourceTracks.length ? (
                <span className="weave-recommend-meta">
                  {sourceTracks.length + " tracks · " + selected.size + " selected"}
                </span>
              ) : null}
            </div>
            {sourceTracks.length ? (
              <div className="weave-copy-actions">
                <button
                  type="button"
                  className="weave-btn weave-btn-ghost"
                  onClick={selectAddable}
                >
                  Select new
                </button>
                <button
                  type="button"
                  className="weave-btn weave-btn-ghost"
                  onClick={clearSelection}
                  disabled={!selected.size}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="weave-btn"
                  onClick={addSelected}
                  disabled={!selected.size}
                >
                  {t("results.addSelected")}
                </button>
                <button
                  type="button"
                  className="weave-btn weave-btn-primary"
                  onClick={addAllNew}
                >
                  Add all new
                </button>
              </div>
            ) : null}
          </div>
          {error ? <div className="weave-find-error">{error}</div> : null}
          <div className="weave-search-results-body">
            {tracksLoading ? (
              <div className="weave-arranger-empty weave-search-waiting">
                <div className="weave-spinner" aria-hidden="true" />
                <p className="weave-search-waiting-label">{t("picker.loading")}</p>
              </div>
            ) : !selectedUri ? (
              <div className="weave-arranger-empty">
                Pick a playlist on the left to browse its tracks.
              </div>
            ) : !sourceTracks.length ? (
              <div className="weave-arranger-empty">No tracks to show.</div>
            ) : (
              <div className="weave-find-list">
                {sourceTracks.map((track, index) => {
                  const inPl = isInPlaylist(track);
                  const checked = !!(track.uri && selected.has(track.uri));
                  return (
                    <div
                      key={track.uid || track.uri || index}
                      className={"weave-find-row" + (inPl ? " is-in-playlist" : "")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={inPl || !track.uri}
                        onChange={() => toggleSelect(track.uri)}
                        title={inPl ? t("notify.alreadyInPlaylist") : t("results.add")}
                      />
                      <PlayButton
                        track={track}
                        playingUri={playingUri}
                        isPlaying={isPlaying}
                        onPlay={onPlay}
                        index={index}
                      />
                      <div className="weave-find-meta">
                        <div className="weave-find-title">
                          {track.name || t("common.unknown")}
                        </div>
                        <div className="weave-find-sub">
                          {[track.artists, track.album].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <FeatureCells
                        track={track}
                        col={KEY_COL}
                        className="weave-find-key"
                        emptyKeyTitle={t("common.unknown")}
                      />
                      <span className="weave-find-dur">
                        {WeaveApi.formatDuration(track.durationMs)}
                      </span>
                      <button
                        type="button"
                        className="weave-btn weave-btn-primary weave-btn-compact"
                        disabled={inPl}
                        onClick={() => onAddTrack?.(track)}
                      >
                        {inPl ? "In playlist" : t("results.add")}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
