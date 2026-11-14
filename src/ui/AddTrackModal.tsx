/**
 * Add Track — catalog Songs search, or Artists → popular / albums drill-in.
 */

import React from "react";
import { t } from "../i18n/index.ts";
import { api as WeaveApi } from "../api/spotify.ts";
import * as Features from "../api/features.ts";
import * as PlaylistOps from "../domain/playlistOps.ts";
import type { TrackRow } from "../types/track.ts";
import { Modal } from "./Modal.tsx";
import { TrackTable } from "./TrackTable.tsx";

type ArtistHit = {
  uri?: string;
  id?: string;
  name?: string;
  imageUrl?: string | null;
  followers?: number | null;
};

type AlbumHit = {
  uri?: string;
  id?: string;
  name?: string;
  imageUrl?: string | null;
  year?: number | string | null;
  group?: string | null;
  totalTracks?: number | null;
};

export type AddTrackModalProps = {
  open: boolean;
  playlistTracks?: TrackRow[] | null;
  playingUri?: string | null;
  isPlaying?: boolean;
  onClose?: () => void;
  onAddTrack?: (track: TrackRow) => void;
  onAddTracks?: (tracks: TrackRow[]) => void;
  onPlay?: (track: TrackRow, index?: number) => void;
};

export function AddTrackModal(props: AddTrackModalProps): React.ReactElement | null {
  const {
    open,
    playlistTracks,
    playingUri,
    isPlaying,
    onClose,
    onAddTrack,
    onAddTracks,
    onPlay,
  } = props;

  const [mode, setMode] = React.useState<"songs" | "artists">("songs");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<TrackRow[]>([]);
  const [artistHits, setArtistHits] = React.useState<ArtistHit[]>([]);
  const [selectedArtist, setSelectedArtist] = React.useState<ArtistHit | null>(null);
  const [artistView, setArtistView] = React.useState<"popular" | "albums" | "album">(
    "popular"
  );
  const [albums, setAlbums] = React.useState<AlbumHit[]>([]);
  const [selectedAlbum, setSelectedAlbum] = React.useState<AlbumHit | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [suggestLoading, setSuggestLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const genRef = React.useRef(0);
  const suggestGenRef = React.useRef(0);

  const existingIndex = React.useMemo(
    () => PlaylistOps.buildExistingIndex(playlistTracks || []),
    [playlistTracks]
  );

  function resetLists(): void {
    setResults([]);
    setArtistHits([]);
    setSelectedArtist(null);
    setArtistView("popular");
    setAlbums([]);
    setSelectedAlbum(null);
    setError(null);
  }

  React.useEffect(() => {
    if (!open) {
      genRef.current += 1;
      suggestGenRef.current += 1;
      setQuery("");
      resetLists();
      setLoading(false);
      setSuggestLoading(false);
      setMode("songs");
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || mode !== "artists" || selectedArtist) return undefined;
    const q = String(query || "").trim();
    if (q.length < 2) {
      suggestGenRef.current += 1;
      setArtistHits([]);
      setSuggestLoading(false);
      setError(null);
      return undefined;
    }

    const gen = ++suggestGenRef.current;
    setSuggestLoading(true);
    const timer = setTimeout(async () => {
      try {
        const list = await WeaveApi.searchArtists(q, { limit: 30 });
        if (gen !== suggestGenRef.current) return;
        setArtistHits(list);
        setError(list.length ? null : t("addTrack.noArtists"));
      } catch (err) {
        if (gen !== suggestGenRef.current) return;
        console.error(err);
        setArtistHits([]);
        setError(err instanceof Error ? err.message : t("notify.searchFailed"));
      } finally {
        if (gen === suggestGenRef.current) setSuggestLoading(false);
      }
    }, 280);

    return () => {
      clearTimeout(timer);
    };
  }, [open, mode, query, selectedArtist]);

  function switchMode(next: "songs" | "artists"): void {
    if (next === mode) return;
    genRef.current += 1;
    suggestGenRef.current += 1;
    setMode(next);
    setQuery("");
    resetLists();
    setLoading(false);
    setSuggestLoading(false);
  }

  async function enrichList(list: TrackRow[]): Promise<TrackRow[]> {
    if (!list?.length) return list || [];
    try {
      const out = await Features.enrichTracks(list.slice());
      return (out as TrackRow[] | undefined) || list;
    } catch (enrichErr) {
      console.warn("Weave: add-track enrich failed", enrichErr);
      return list;
    }
  }

  async function runSongSearch(e?: React.FormEvent): Promise<void> {
    e?.preventDefault?.();
    if (mode !== "songs") return;
    const q = String(query || "").trim();
    if (!q) return;
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    setSelectedArtist(null);
    setArtistHits([]);
    setArtistView("popular");
    setAlbums([]);
    setSelectedAlbum(null);
    try {
      let list = await WeaveApi.searchTracks(q, { limit: 30 });
      if (gen !== genRef.current) return;
      list = await enrichList(list);
      if (gen !== genRef.current) return;
      setResults(list);
      if (!list.length) setError(t("results.empty"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setResults([]);
      setError(err instanceof Error ? err.message : t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }

  async function openArtist(artist: ArtistHit): Promise<void> {
    if (!artist?.uri && !artist?.id) return;
    suggestGenRef.current += 1;
    const gen = ++genRef.current;
    setSelectedArtist(artist);
    setArtistHits([]);
    setResults([]);
    setAlbums([]);
    setSelectedAlbum(null);
    setArtistView("popular");
    setError(null);
    setLoading(true);
    setSuggestLoading(false);
    try {
      let list = await WeaveApi.getArtistTopTracks(artist.id || artist.uri || "", {
        limit: 30,
      });
      if (gen !== genRef.current) return;
      list = await enrichList(list);
      if (gen !== genRef.current) return;
      setResults(list);
      if (!list.length) setError(t("addTrack.noTopTracks"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setResults([]);
      setError(err instanceof Error ? err.message : t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }

  async function loadAlbums(): Promise<void> {
    if (!selectedArtist) return;
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    setSelectedAlbum(null);
    setResults([]);
    setArtistView("albums");
    try {
      const list = await WeaveApi.getArtistAlbums(
        selectedArtist.id || selectedArtist.uri || "",
        { limit: 50 }
      );
      if (gen !== genRef.current) return;
      setAlbums(list);
      if (!list.length) setError(t("addTrack.noAlbums"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setAlbums([]);
      setError(err instanceof Error ? err.message : t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }

  async function openAlbum(album: AlbumHit): Promise<void> {
    if (!album?.uri && !album?.id) return;
    const gen = ++genRef.current;
    setSelectedAlbum(album);
    setArtistView("album");
    setResults([]);
    setError(null);
    setLoading(true);
    try {
      let list = await WeaveApi.getAlbumTracks(album.uri || album.id || "", {
        limit: 80,
      });
      if (gen !== genRef.current) return;
      list = await enrichList(list);
      if (gen !== genRef.current) return;
      setResults(list);
      if (!list.length) setError(t("addTrack.noAlbumTracks"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setResults([]);
      setError(err instanceof Error ? err.message : t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }

  async function backToPopular(): Promise<void> {
    if (!selectedArtist) return;
    const gen = ++genRef.current;
    setSelectedAlbum(null);
    setAlbums([]);
    setArtistView("popular");
    setResults([]);
    setError(null);
    setLoading(true);
    try {
      let list = await WeaveApi.getArtistTopTracks(
        selectedArtist.id || selectedArtist.uri || "",
        { limit: 30 }
      );
      if (gen !== genRef.current) return;
      list = await enrichList(list);
      if (gen !== genRef.current) return;
      setResults(list);
      if (!list.length) setError(t("addTrack.noTopTracks"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setResults([]);
      setError(err instanceof Error ? err.message : t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }

  function backToAlbums(): void {
    genRef.current += 1;
    setSelectedAlbum(null);
    setResults([]);
    setArtistView("albums");
    setError(albums.length ? null : t("addTrack.noAlbums"));
    setLoading(false);
  }

  function backToArtistSearch(): void {
    genRef.current += 1;
    setSelectedArtist(null);
    setSelectedAlbum(null);
    setAlbums([]);
    setArtistView("popular");
    setResults([]);
    setError(null);
    setLoading(false);
  }

  function handleArtistBack(): void {
    if (artistView === "album") {
      backToAlbums();
      return;
    }
    if (artistView === "albums") {
      void backToPopular();
      return;
    }
    backToArtistSearch();
  }

  function artistBackLabel(): string {
    if (artistView === "album") return t("addTrack.backToAlbums");
    if (artistView === "albums") return t("addTrack.backToPopular");
    return t("addTrack.backToArtists");
  }

  function addAllNew(): void {
    const batch = (results || []).filter(
      (tr) => tr?.uri && !PlaylistOps.isInIndex(existingIndex, tr)
    );
    if (!batch.length) {
      WeaveApi.notify(t("addTrack.noNewTracks"), true);
      return;
    }
    if (typeof onAddTracks === "function") {
      onAddTracks(batch);
    } else {
      for (const tr of batch) onAddTrack?.(tr);
    }
  }

  function onArtistFormSubmit(e?: React.FormEvent): void {
    e?.preventDefault?.();
    if (selectedArtist) return;
    if (artistHits.length) {
      void openArtist(artistHits[0]);
    }
  }

  function formatFollowers(n: unknown): string | null {
    if (n == null || !Number.isFinite(Number(n))) return null;
    const v = Number(n);
    if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + "K";
    return String(v);
  }

  function albumSubtitle(album: AlbumHit): string {
    const parts: string[] = [];
    if (album?.year) parts.push(String(album.year));
    if (album?.group === "single" || album?.group === "singles") {
      parts.push(t("addTrack.albumGroupSingle"));
    } else if (album?.group === "compilation" || album?.group === "compilations") {
      parts.push(t("addTrack.albumGroupCompilation"));
    }
    if (album?.totalTracks != null) {
      parts.push(t("addTrack.albumTrackCount", { count: album.totalTracks }));
    }
    return parts.join(" · ");
  }

  const showingTrackTable =
    mode === "songs" ||
    !!(selectedArtist && (artistView === "popular" || artistView === "album"));
  const newCount = showingTrackTable
    ? (results || []).filter(
        (tr) => tr?.uri && !PlaylistOps.isInIndex(existingIndex, tr)
      ).length
    : 0;

  let meta: string | null = null;
  if (selectedArtist && artistView === "album" && selectedAlbum) {
    meta = t("addTrack.albumMeta", {
      album: selectedAlbum.name || "",
      count: results.length,
    });
  } else if (selectedArtist && artistView === "albums") {
    meta = t("addTrack.albumsMeta", {
      name: selectedArtist.name || "",
      count: albums.length,
    });
  } else if (selectedArtist) {
    meta = t("addTrack.artistMeta", {
      name: selectedArtist.name || "",
      count: results.length,
    });
  } else if (results.length) {
    meta = t("results.meta", { count: results.length });
  }

  return (
    <Modal
      open={open}
      title={t("addTrack.title")}
      meta={meta}
      onClose={onClose}
      ariaLabel={t("addTrack.title")}
      className="weave-find-modal weave-add-track-modal"
    >
      <div className="weave-add-track-toolbar">
        <div
          className="weave-add-track-modes"
          role="tablist"
          aria-label={t("addTrack.modeLabel")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "songs"}
            className={
              "weave-btn weave-btn-ghost" +
              (mode === "songs" ? " weave-btn-active" : "")
            }
            onClick={() => switchMode("songs")}
          >
            {t("addTrack.modeSongs")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "artists"}
            className={
              "weave-btn weave-btn-ghost" +
              (mode === "artists" ? " weave-btn-active" : "")
            }
            onClick={() => switchMode("artists")}
          >
            {t("addTrack.modeArtists")}
          </button>
        </div>
        {selectedArtist ? (
          <div className="weave-add-track-artist-bar">
            <button
              type="button"
              className="weave-btn weave-btn-ghost weave-add-track-back"
              onClick={handleArtistBack}
            >
              {artistBackLabel()}
            </button>
            <div className="weave-add-track-artist-chip">
              {selectedArtist.imageUrl ? (
                <img
                  className="weave-add-track-artist-avatar"
                  src={selectedArtist.imageUrl}
                  alt=""
                />
              ) : (
                <div
                  className="weave-add-track-artist-avatar weave-add-track-artist-avatar-fallback"
                  aria-hidden="true"
                />
              )}
              <div className="weave-add-track-artist-meta">
                <span className="weave-add-track-artist-name">
                  {selectedArtist.name || ""}
                </span>
                {selectedAlbum ? (
                  <span className="weave-add-track-artist-sub">
                    {selectedAlbum.name || ""}
                  </span>
                ) : artistView === "albums" ? (
                  <span className="weave-add-track-artist-sub">
                    {t("addTrack.albumsHeading")}
                  </span>
                ) : (
                  <span className="weave-add-track-artist-sub">
                    {t("addTrack.popularHeading")}
                  </span>
                )}
              </div>
            </div>
            {artistView === "popular" ? (
              <button
                type="button"
                className="weave-btn"
                disabled={loading}
                onClick={() => void loadAlbums()}
              >
                {t("addTrack.loadAlbums")}
              </button>
            ) : null}
            {artistView === "popular" || artistView === "album" ? (
              <button
                type="button"
                className="weave-btn weave-btn-primary"
                disabled={loading || newCount === 0}
                onClick={addAllNew}
              >
                {t("addTrack.addAllNew")}
              </button>
            ) : null}
          </div>
        ) : (
          <form
            className="weave-find-search-bar weave-add-track-search"
            onSubmit={mode === "songs" ? runSongSearch : onArtistFormSubmit}
          >
            <input
              type="search"
              className="weave-find-input"
              placeholder={
                mode === "songs"
                  ? t("addTrack.placeholder")
                  : t("addTrack.placeholderArtist")
              }
              value={query}
              autoFocus
              data-autofocus
              onChange={(ev) => setQuery(ev.target.value)}
            />
            {mode === "songs" ? (
              <button
                type="submit"
                className="weave-btn weave-btn-primary"
                disabled={loading || !String(query || "").trim()}
              >
                {loading ? t("picker.loading") : t("addTrack.search")}
              </button>
            ) : null}
          </form>
        )}
      </div>
      {error ? <div className="weave-find-error">{error}</div> : null}
      {mode === "artists" && !selectedArtist ? (
        <div className="weave-add-track-suggest">
          {suggestLoading && !artistHits.length ? (
            <div className="weave-add-track-suggest-status">{t("picker.loading")}</div>
          ) : null}
          {!suggestLoading &&
          String(query || "").trim().length < 2 &&
          !artistHits.length ? (
            <div className="weave-add-track-suggest-status">
              {t("addTrack.artistSuggestHint")}
            </div>
          ) : null}
          {artistHits.length ? (
            <div
              className="weave-add-track-artist-list"
              role="listbox"
              aria-label={t("addTrack.modeArtists")}
            >
              {artistHits.map((artist, index) => {
                const followers = formatFollowers(artist.followers);
                return (
                  <button
                    type="button"
                    key={artist.uri || artist.id || index}
                    role="option"
                    className="weave-add-track-artist-row"
                    onClick={() => void openArtist(artist)}
                  >
                    {artist.imageUrl ? (
                      <img
                        className="weave-add-track-artist-avatar"
                        src={artist.imageUrl}
                        alt=""
                      />
                    ) : (
                      <div
                        className="weave-add-track-artist-avatar weave-add-track-artist-avatar-fallback"
                        aria-hidden="true"
                      />
                    )}
                    <div className="weave-add-track-artist-meta">
                      <div className="weave-add-track-artist-name">
                        {artist.name || ""}
                      </div>
                      {followers ? (
                        <div className="weave-add-track-artist-sub">
                          {t("addTrack.followers", { count: followers })}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : selectedArtist && artistView === "albums" ? (
        <div className="weave-add-track-suggest">
          {loading && !albums.length ? (
            <div className="weave-add-track-suggest-status">{t("picker.loading")}</div>
          ) : null}
          {albums.length ? (
            <div
              className="weave-add-track-album-list"
              role="listbox"
              aria-label={t("addTrack.albumsHeading")}
            >
              {albums.map((album, index) => {
                const sub = albumSubtitle(album);
                return (
                  <button
                    type="button"
                    key={album.uri || album.id || index}
                    role="option"
                    className="weave-add-track-album-row"
                    onClick={() => void openAlbum(album)}
                  >
                    {album.imageUrl ? (
                      <img
                        className="weave-add-track-album-cover"
                        src={album.imageUrl}
                        alt=""
                      />
                    ) : (
                      <div
                        className="weave-add-track-album-cover weave-add-track-album-cover-fallback"
                        aria-hidden="true"
                      />
                    )}
                    <div className="weave-add-track-artist-meta">
                      <div className="weave-add-track-artist-name">
                        {album.name || ""}
                      </div>
                      {sub ? (
                        <div className="weave-add-track-artist-sub">{sub}</div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="weave-search-results-body">
          <TrackTable
            tracks={results}
            playingUri={playingUri}
            isPlaying={isPlaying}
            onPlay={onPlay}
            onAddTrack={onAddTrack}
            disabledReason={(track) =>
              PlaylistOps.isInIndex(existingIndex, track)
                ? t("notify.alreadyInPlaylist")
                : null
            }
            rowClassName={(track) =>
              PlaylistOps.isInIndex(existingIndex, track) ? "is-in-playlist" : ""
            }
            loading={loading}
            loadingLabel={t("picker.loading")}
            emptyLabel={
              mode === "artists" ? t("addTrack.emptyArtist") : t("addTrack.empty")
            }
          />
        </div>
      )}
    </Modal>
  );
}
