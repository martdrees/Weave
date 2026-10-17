//@ts-check
/**
 * MixAppApi façade — stable surface for UI / hooks (R3.1).
 * Ports: notify, http, playlists, catalogSearch.
 */

const MixAppApi = (() => {
  return {
    notify: MixAppNotify.notify,
    formatDuration: MixAppHttp.formatDuration,
    withRetry: MixAppHttp.withRetry,
    isRateLimitError: MixAppHttp.isRateLimitError,
    listPlaylists: MixAppPlaylists.listPlaylists,
    getPlaylistMeta: MixAppPlaylists.getPlaylistMeta,
    getPlaylistTracks: MixAppPlaylists.getPlaylistTracks,
    createPlaylist: MixAppPlaylists.createPlaylist,
    saveOverwrite: MixAppPlaylists.saveOverwrite,
    getCurrentUserId: MixAppPlaylists.getCurrentUserId,
    searchTracks: MixAppCatalogSearch.searchTracks,
    searchPlaylists: MixAppCatalogSearch.searchPlaylists,
  };
})();
