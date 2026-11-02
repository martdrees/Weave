//@ts-check
/**
 * Shared JSDoc typedefs for Weave façades (R7.2).
 * Loaded first via manifest — ambient types for `//@ts-check` across IIFE modules.
 * Runtime: no exports; Spicetify ignores the empty script body.
 *
 * Canonical field docs: docs/TRACK.md
 */

/**
 * Core playlist / catalog track (always present after WeaveTrack.ensure / from*).
 * @typedef {object} WeaveTrackCore
 * @property {string} uri
 * @property {string} uid
 * @property {string|null} id
 * @property {string} name
 * @property {string} artists
 * @property {string[]} artistIds
 * @property {string} album
 * @property {string|null} albumId
 * @property {string|null} albumUri
 * @property {number} durationMs
 * @property {boolean} explicit
 * @property {string|null} addedAt
 * @property {number|null} year
 * @property {number|string|null} bpm
 * @property {string|null} key
 */

/**
 * Optional enrichment written in place by WeaveFeatures.enrichTracks.
 * @typedef {object} WeaveTrackEnrichment
 * @property {boolean} [featuresLoaded]
 * @property {number|null} [keyIndex]
 * @property {number|null} [keyMode]
 * @property {boolean} [keyNative] Spotify AudioAttributesV2 Camelot
 * @property {boolean} [bpmNative] Spotify AudioAttributesV2 BPM
 * @property {string|null} [keyColor] Spotify camelotKey.color
 * @property {string|null} [standardKey] Spotify standard key root (e.g. F#)
 * @property {"minor"|"major"|null} [standardMode]
 * @property {number|null} [energy]
 * @property {number|null} [danceability]
 * @property {number|null} [valence]
 * @property {number|null} [acousticness]
 * @property {number|null} [instrumentalness]
 * @property {number|null} [speechiness]
 * @property {number|null} [liveness]
 * @property {number|null} [loudness]
 * @property {number|null} [tempo]
 * @property {number|null} [popularity]
 */

/**
 * Canonical Weave track (core + optional enrichment).
 * @typedef {WeaveTrackCore & WeaveTrackEnrichment} WeaveTrackRow
 */

/**
 * Result of WeaveRecommend.recommend.
 * @typedef {object} WeaveRecommendResult
 * @property {WeaveTrackRow[]} tracks
 * @property {object} featuresUsed
 * @property {string} engine
 * @property {number} [radioCount]
 * @property {number} [playlistsUsed]
 * @property {number} [rawTotal]
 * @property {boolean} [usedSoftSeeds]
 */

/**
 * Result of WeavePlaylistOps.appendTracks.
 * @typedef {object} WeaveAppendResult
 * @property {WeaveTrackRow[]} next
 * @property {WeaveTrackRow[]} added
 */

/**
 * Position for WeavePlaylists.moveTrack — exactly one field set.
 * `after` / `before` are Spotify playlist-item uids (`after` may be `"end"`).
 * `index` is the desired final 0-based index after the move.
 * @typedef {object} WeaveMovePosition
 * @property {string} [after]
 * @property {string} [before]
 * @property {number} [index]
 */

/**
 * WeaveApi façade surface (see api/spotify.js).
 * @typedef {object} WeaveApiFacade
 * @property {(message: string, isError?: boolean) => void} notify
 * @property {(ms: number|null|undefined) => string} formatDuration
 * @property {<T>(fn: () => Promise<T>, opts?: object) => Promise<T>} withRetry
 * @property {(err: unknown) => boolean} isRateLimitError
 * @property {() => Promise<object[]>} listPlaylists
 * @property {(uri: string) => Promise<object|null>} getPlaylistMeta
 * @property {(uri: string) => Promise<WeaveTrackRow[]>} getPlaylistTracks
 * @property {(name: string, trackUris: string[]) => Promise<string>} createPlaylist
 * @property {(uri: string, tracks: WeaveTrackRow[]) => Promise<WeaveTrackRow[]>} saveOverwrite
 * @property {(uri: string, trackUris: string[], opts?: { after?: string }) => Promise<WeaveTrackRow[]>} addTracks
 * @property {(uri: string, items: { uri: string, uid: string }[]) => Promise<void>} removeTracks
 * @property {(uri: string, item: { uri: string, uid: string }, position: WeaveMovePosition) => Promise<void>} moveTrack
 * @property {(uri: string, tracks: WeaveTrackRow[]) => Promise<WeaveTrackRow[]>} applyBulk
 * @property {(uri: string) => Promise<WeaveTrackRow[]>} reload
 * @property {() => Promise<string|null>} getCurrentUserId
 * @property {(query: string, opts?: object) => Promise<WeaveTrackRow[]>} searchTracks
 * @property {(query: string, opts?: object) => Promise<object[]>} searchPlaylists
 * @property {(query: string, opts?: object) => Promise<object[]>} searchArtists
 * @property {(artistIdOrUri: string, opts?: object) => Promise<WeaveTrackRow[]>} getArtistTopTracks
 * @property {(artistIdOrUri: string, opts?: object) => Promise<object[]>} getArtistAlbums
 * @property {(albumIdOrUri: string, opts?: object) => Promise<WeaveTrackRow[]>} getAlbumTracks
 */

void 0;
