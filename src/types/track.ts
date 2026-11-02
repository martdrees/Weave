/**
 * Canonical Weave track shapes (ported from legacy types.js).
 * @see docs/TRACK.md
 */

/** Core playlist / catalog track (always present after ensure / from*). */
export type TrackCore = {
  uri: string;
  uid: string;
  id: string | null;
  name: string;
  artists: string;
  artistIds: string[];
  album: string;
  albumId: string | null;
  albumUri: string | null;
  durationMs: number;
  explicit: boolean;
  addedAt: string | null;
  year: number | null;
  bpm: number | string | null;
  key: string | null;
};

/** Optional enrichment written by features enrich. */
export type TrackEnrichment = {
  featuresLoaded?: boolean;
  keyIndex?: number | null;
  keyMode?: number | null;
  /** Spotify AudioAttributesV2 Camelot */
  keyNative?: boolean;
  /** Spotify AudioAttributesV2 BPM */
  bpmNative?: boolean;
  keyColor?: string | null;
  standardKey?: string | null;
  standardMode?: "minor" | "major" | null;
  energy?: number | null;
  danceability?: number | null;
  valence?: number | null;
  acousticness?: number | null;
  instrumentalness?: number | null;
  speechiness?: number | null;
  liveness?: number | null;
  loudness?: number | null;
  tempo?: number | null;
  popularity?: number | null;
};

/** Canonical Weave track row. */
export type TrackRow = TrackCore & TrackEnrichment;

/** Result of recommend (typed for later api port). */
export type RecommendResult = {
  tracks: TrackRow[];
  featuresUsed: Record<string, unknown>;
  engine: string;
  radioCount?: number;
  playlistsUsed?: number;
  rawTotal?: number;
  usedSoftSeeds?: boolean;
};

/** Result of appendTracks. */
export type AppendResult = {
  next: TrackRow[];
  added: TrackRow[];
  skipped: Array<Partial<TrackRow> | null | undefined>;
};

/** Position for moveTrack — exactly one field set. */
export type MovePosition = {
  after?: string;
  before?: string;
  index?: number;
};

/** Parsed Spotify native key (AudioAttributesV2 / playlist trackKey). */
export type NativeKeyInfo = {
  camelot: string | null;
  standardKey: string | null;
  mode: "minor" | "major" | null;
  color: string | null;
  native: true;
};
