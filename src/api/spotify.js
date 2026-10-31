//@ts-check
/**
 * MixAppApi façade — stable surface for UI / hooks (R3.1).
 * Ports: notify, http, playlists, catalogSearch.
 * Shape: {@link MixAppApiFacade} in types.js.
 */

const MixAppApi = (() => {
  const api = {
    notify: MixAppNotify.notify,
    formatDuration: MixAppHttp.formatDuration,
    withRetry: MixAppHttp.withRetry,
    isRateLimitError: MixAppHttp.isRateLimitError,
    listPlaylists: MixAppPlaylists.listPlaylists,
    getPlaylistMeta: MixAppPlaylists.getPlaylistMeta,
    getPlaylistTracks: MixAppPlaylists.getPlaylistTracks,
    createPlaylist: MixAppPlaylists.createPlaylist,
    saveOverwrite: MixAppPlaylists.saveOverwrite,
    addTracks: MixAppPlaylists.addTracks,
    removeTracks: MixAppPlaylists.removeTracks,
    moveTrack: MixAppPlaylists.moveTrack,
    applyBulk: MixAppPlaylists.applyBulk,
    reload: MixAppPlaylists.reload,
    getCurrentUserId: MixAppPlaylists.getCurrentUserId,
    searchTracks: MixAppCatalogSearch.searchTracks,
    searchPlaylists: MixAppCatalogSearch.searchPlaylists,
    searchArtists: MixAppCatalogSearch.searchArtists,
    getArtistTopTracks: MixAppCatalogSearch.getArtistTopTracks,
    getArtistAlbums: MixAppCatalogSearch.getArtistAlbums,
    getAlbumTracks: MixAppCatalogSearch.getAlbumTracks,
  };
  return /** @type {MixAppApiFacade} */ (api);
})();
