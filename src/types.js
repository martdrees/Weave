//@ts-check
/**
 * Shared JSDoc typedefs for MixApp façades (R7.2).
 * Loaded first via manifest — ambient types for `//@ts-check` across IIFE modules.
 * Runtime: no exports; Spicetify ignores the empty script body.
 *
 * Canonical field docs: docs/TRACK.md
 */

/**
 * Core playlist / catalog track (always present after MixAppTrack.ensure / from*).
 * @typedef {object} MixAppTrackCore
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
 * Optional enrichment written in place by MixAppFeatures.enrichTracks.
 * @typedef {object} MixAppTrackEnrichment
 * @property {boolean} [featuresLoaded]
 * @property {number|null} [keyIndex]
 * @property {number|null} [keyMode]
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
 * Canonical MixApp track (core + optional enrichment).
 * @typedef {MixAppTrackCore & MixAppTrackEnrichment} MixAppTrackRow
 */

/**
 * Result of MixAppRecommend.recommend.
 * @typedef {object} MixAppRecommendResult
 * @property {MixAppTrackRow[]} tracks
 * @property {object} featuresUsed
 * @property {string} engine
 * @property {number} [radioCount]
 * @property {number} [playlistsUsed]
 * @property {number} [rawTotal]
 * @property {boolean} [usedSoftSeeds]
 */

/**
 * Result of MixAppPlaylistOps.appendTracks.
 * @typedef {object} MixAppAppendResult
 * @property {MixAppTrackRow[]} next
 * @property {MixAppTrackRow[]} added
 */

/**
 * MixAppApi façade surface (see api/spotify.js).
 * @typedef {object} MixAppApiFacade
 * @property {(message: string, isError?: boolean) => void} notify
 * @property {(ms: number|null|undefined) => string} formatDuration
 * @property {<T>(fn: () => Promise<T>, opts?: object) => Promise<T>} withRetry
 * @property {(err: unknown) => boolean} isRateLimitError
 * @property {() => Promise<object[]>} listPlaylists
 * @property {(uri: string) => Promise<object|null>} getPlaylistMeta
 * @property {(uri: string) => Promise<MixAppTrackRow[]>} getPlaylistTracks
 * @property {(name: string, trackUris: string[]) => Promise<string>} createPlaylist
 * @property {(uri: string, tracks: MixAppTrackRow[]) => Promise<MixAppTrackRow[]>} saveOverwrite
 * @property {() => Promise<string|null>} getCurrentUserId
 * @property {(query: string, opts?: object) => Promise<MixAppTrackRow[]>} searchTracks
 * @property {(query: string, opts?: object) => Promise<object[]>} searchPlaylists
 */

void 0;
