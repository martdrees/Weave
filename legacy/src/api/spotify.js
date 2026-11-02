//@ts-check
/**
 * WeaveApi façade — stable surface for UI / hooks (R3.1).
 * Ports: notify, http, playlists, catalogSearch.
 * Shape: {@link WeaveApiFacade} in types.js.
 */

const WeaveApi = (() => {
  const api = {
    notify: WeaveNotify.notify,
    formatDuration: WeaveHttp.formatDuration,
    withRetry: WeaveHttp.withRetry,
    isRateLimitError: WeaveHttp.isRateLimitError,
    listPlaylists: WeavePlaylists.listPlaylists,
    getPlaylistMeta: WeavePlaylists.getPlaylistMeta,
    getPlaylistTracks: WeavePlaylists.getPlaylistTracks,
    createPlaylist: WeavePlaylists.createPlaylist,
    saveOverwrite: WeavePlaylists.saveOverwrite,
    addTracks: WeavePlaylists.addTracks,
    removeTracks: WeavePlaylists.removeTracks,
    moveTrack: WeavePlaylists.moveTrack,
    applyBulk: WeavePlaylists.applyBulk,
    reload: WeavePlaylists.reload,
    getCurrentUserId: WeavePlaylists.getCurrentUserId,
    searchTracks: WeaveCatalogSearch.searchTracks,
    searchPlaylists: WeaveCatalogSearch.searchPlaylists,
    searchArtists: WeaveCatalogSearch.searchArtists,
    getArtistTopTracks: WeaveCatalogSearch.getArtistTopTracks,
    getArtistAlbums: WeaveCatalogSearch.getArtistAlbums,
    getAlbumTracks: WeaveCatalogSearch.getAlbumTracks,
  };
  return /** @type {WeaveApiFacade} */ (api);
})();
