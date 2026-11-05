/**
 * WeaveApi façade — stable surface for UI / hooks.
 * Ports: notify, http, playlists, catalogSearch.
 */

import { notify } from "./notify.ts";
import { formatDuration, withRetry, isRateLimitError } from "./http.ts";
import * as Playlists from "./playlists.ts";
import * as CatalogSearch from "./catalogSearch.ts";

export const api = {
  notify,
  formatDuration,
  withRetry,
  isRateLimitError,
  listPlaylists: Playlists.listPlaylists,
  getPlaylistMeta: Playlists.getPlaylistMeta,
  getPlaylistTracks: Playlists.getPlaylistTracks,
  createPlaylist: Playlists.createPlaylist,
  saveOverwrite: Playlists.saveOverwrite,
  addTracks: Playlists.addTracks,
  removeTracks: Playlists.removeTracks,
  moveTrack: Playlists.moveTrack,
  applyBulk: Playlists.applyBulk,
  reload: Playlists.reload,
  getCurrentUserId: Playlists.getCurrentUserId,
  searchTracks: CatalogSearch.searchTracks,
  searchPlaylists: CatalogSearch.searchPlaylists,
  searchArtists: CatalogSearch.searchArtists,
  getArtistTopTracks: CatalogSearch.getArtistTopTracks,
  getArtistAlbums: CatalogSearch.getArtistAlbums,
  getAlbumTracks: CatalogSearch.getAlbumTracks,
};

export default api;
