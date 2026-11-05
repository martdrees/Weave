/**
 * Canonical Weave track shape + Spotify anti-corruption adapters.
 * Single adapter path — do not add normalizeWebTrack aliases (ADR 004).
 * @see docs/TRACK.md
 */

import type { NativeKeyInfo, TrackCore, TrackRow } from "../types/track.ts";

export const CORE_KEYS = Object.freeze([
  "uri",
  "uid",
  "id",
  "name",
  "artists",
  "artistIds",
  "album",
  "albumId",
  "albumUri",
  "durationMs",
  "explicit",
  "addedAt",
  "year",
  "bpm",
  "key",
] as const);

/** Enrichment keys written by features enrich. */
export const FEATURE_KEYS = Object.freeze([
  "featuresLoaded",
  "keyIndex",
  "keyMode",
  "energy",
  "danceability",
  "valence",
  "acousticness",
  "instrumentalness",
  "speechiness",
  "liveness",
  "loudness",
  "tempo",
  "popularity",
] as const);

function idFromSpotifyUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  return String(uri).split(":").pop() || null;
}

/** Extract Spotify track id from a track URI (sole id-from-uri helper). */
export function trackIdFromUri(uri: string | null | undefined): string | null {
  if (!uri || !String(uri).includes(":track:")) return null;
  return idFromSpotifyUri(uri);
}

function normalizeFingerprintPart(s: unknown): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/\[.*?\]/g, " ")
    .replace(/\b(feat\.?|ft\.?|featuring|with)\b.*$/i, " ")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Same-song identity across different Spotify track IDs (album vs single, etc.).
 * Lives in domain so playlistOps need not import Recommend (ADR 004).
 */
export function trackFingerprint(
  t:
    | { name?: string; artists?: string | Array<{ name?: string } | string> }
    | null
    | undefined
): string | null {
  if (!t) return null;
  const name = normalizeFingerprintPart(t.name);
  const artistStr =
    typeof t.artists === "string"
      ? t.artists
      : Array.isArray(t.artists)
        ? t.artists
            .map((a) => (typeof a === "string" ? a : a?.name))
            .filter(Boolean)
            .join(", ")
        : "";
  const primary = normalizeFingerprintPart(String(artistStr).split(",")[0] || "");
  if (!name || !primary) return null;
  return name + "|" + primary;
}

function pickAttr(
  obj: Record<string, unknown> | null | undefined,
  ...keys: string[]
): unknown {
  if (!obj) return null;
  for (const key of keys) {
    const v = obj[key];
    if (v != null && v !== "") return v;
  }
  return null;
}

function yearFromRelease(release: unknown): number | null {
  if (release == null || release === "") return null;
  const y = parseInt(String(release).slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

function artistsDisplay(list: unknown): string {
  return (Array.isArray(list) ? list : [])
    .map((a) => (a && typeof a === "object" ? (a as { name?: string }).name : a))
    .filter(Boolean)
    .join(", ");
}

function artistIdsFromList(list: unknown): string[] {
  return (Array.isArray(list) ? list : [])
    .map((a) => {
      if (!a || typeof a !== "object") return null;
      const o = a as { id?: string; uri?: string };
      return o.id || (o.uri ? String(o.uri).split(":").pop() : null);
    })
    .filter(Boolean) as string[];
}

function normalizeBpm(bpm: unknown): number | string | null {
  if (bpm == null) return null;
  if (typeof bpm === "number") {
    return Number.isFinite(bpm) ? Math.round(bpm) : null;
  }
  const n = parseFloat(String(bpm));
  return Number.isFinite(n) ? Math.round(n) : String(bpm);
}

const V2_MODE_MINOR = 1;
const V2_MODE_MAJOR = 2;

/** Coerce Spotify playlist Key / AudioAttributesV2 trackKey shapes. */
export function coerceSpotifyTrackKey(value: unknown): NativeKeyInfo | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (!s || s === "[object Object]") return null;
    const m = s.match(/(\d{1,2})\s*([ABab])/);
    if (!m) return null;
    return {
      camelot: parseInt(m[1], 10) + m[2].toUpperCase(),
      standardKey: null,
      mode: null,
      color: null,
      native: true,
    };
  }
  if (typeof value !== "object") return null;

  const obj = value as Record<string, unknown>;
  const camelotKey = obj.camelotKey;
  const camelotRaw =
    (typeof camelotKey === "string" && camelotKey) ||
    (camelotKey &&
      typeof camelotKey === "object" &&
      (camelotKey as { value?: string }).value) ||
    obj.camelot ||
    null;
  let camelot: string | null = null;
  if (camelotRaw) {
    const m = String(camelotRaw).match(/(\d{1,2})\s*([ABab])/);
    if (m) camelot = parseInt(m[1], 10) + m[2].toUpperCase();
  }

  const standardRaw =
    (typeof obj.standardKey === "string" && obj.standardKey) ||
    (typeof obj.key === "string" && obj.key) ||
    null;
  const standardKey = standardRaw ? String(standardRaw).trim() || null : null;

  let mode: "minor" | "major" | null = null;
  if (obj.mode === "minor" || obj.mode === "major") {
    mode = obj.mode;
  } else if (obj.mode === V2_MODE_MINOR || obj.mode === "1") {
    mode = "minor";
  } else if (obj.mode === V2_MODE_MAJOR || obj.mode === "2") {
    mode = "major";
  }

  const color =
    (typeof obj.color === "string" && obj.color) ||
    (camelotKey &&
      typeof camelotKey === "object" &&
      (camelotKey as { color?: string }).color) ||
    null;

  if (!camelot && !standardKey) return null;
  return {
    camelot,
    standardKey,
    mode,
    color: color ? String(color) : null,
    native: true,
  };
}

/** Apply native Spotify key/BPM fields onto a track row (mutates). */
export function applyNativeAudioAttrs(
  row: TrackRow,
  keyInfo: {
    camelot?: string | null;
    standardKey?: string | null;
    mode?: string | null;
    color?: string | null;
  } | null,
  bpm?: number | string | null
): TrackRow {
  if (!row) return row;
  if (keyInfo) {
    if (keyInfo.camelot) {
      row.key = keyInfo.camelot;
      row.keyNative = true;
    }
    if (keyInfo.standardKey) row.standardKey = keyInfo.standardKey;
    if (keyInfo.mode === "minor" || keyInfo.mode === "major") {
      row.standardMode = keyInfo.mode;
    }
    if (keyInfo.color) row.keyColor = keyInfo.color;
  }
  if (bpm != null && bpm !== "") {
    const n = normalizeBpm(bpm);
    if (n != null) {
      row.bpm = n;
      row.bpmNative = true;
    }
  }
  return row;
}

function extractPlaylistKey(
  raw: Record<string, unknown> | null | undefined,
  track: Record<string, unknown> | null | undefined,
  attrs: Record<string, unknown>
): NativeKeyInfo | null {
  const candidates = [
    raw?.trackKey,
    track?.trackKey,
    raw?.key,
    track?.key,
    attrs?.camelot,
    attrs?.["musical-key"],
    attrs?.key,
  ];
  for (const c of candidates) {
    const parsed = coerceSpotifyTrackKey(c);
    if (parsed) return parsed;
  }
  return null;
}

/** Empty / default core track. */
export function blank(partial?: Partial<TrackCore>): TrackRow {
  const p = partial || {};
  return {
    uri: p.uri || "",
    uid: p.uid != null ? String(p.uid) : "",
    id: p.id ?? null,
    name: p.name || "Unknown",
    artists: p.artists || "",
    artistIds: Array.isArray(p.artistIds) ? p.artistIds : [],
    album: p.album || "",
    albumId: p.albumId ?? null,
    albumUri: p.albumUri ?? null,
    durationMs: Number(p.durationMs) || 0,
    explicit: !!p.explicit,
    addedAt: p.addedAt ?? null,
    year: p.year ?? null,
    bpm: p.bpm ?? null,
    key: p.key != null ? String(p.key) : null,
  };
}

/** Coerce a partial into a full core track (keeps unknown extra keys). */
export function ensure(partial?: Partial<TrackRow> | null): TrackRow {
  const base = blank(partial || undefined);
  if (!partial || typeof partial !== "object") return base;
  const out: TrackRow = { ...partial, ...base };
  for (const k of CORE_KEYS) {
    const v = partial[k];
    if (v != null && v !== "") {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  if (!out.id && out.uri) out.id = trackIdFromUri(out.uri);
  if (out.key != null) out.key = String(out.key);
  out.explicit = !!out.explicit;
  out.durationMs = Number(out.durationMs) || 0;
  out.artistIds = Array.isArray(out.artistIds) ? out.artistIds : [];
  return out;
}

/** Platform playlist row or Web API playlist /items row. */
export function fromPlaylistItem(
  raw: Record<string, unknown> | null | undefined,
  index: number
): TrackRow {
  const track = (raw?.track || raw?.item || raw || {}) as Record<string, unknown>;
  const album = (track?.album || raw?.album || {}) as Record<string, unknown>;
  const artists =
    track?.artists || raw?.artists || (track?.artist ? [track.artist] : []) || [];
  const uri = String(track?.uri || raw?.uri || "");
  const uid = String(raw?.uid || raw?.addTime || `${uri}:${index}`);
  const attrs = (raw?.formatListAttributes ||
    track?.formatListAttributes ||
    {}) as Record<string, unknown>;
  const bpm =
    pickAttr(attrs, "bpm", "tempo", "musical-bpm") ??
    pickAttr(track, "bpm", "tempo") ??
    pickAttr(raw as Record<string, unknown>, "bpm", "tempo");
  const nativeKey = extractPlaylistKey(raw, track, attrs);
  const artistList = Array.isArray(artists) ? artists : [];
  const albumDate = album?.date as { isoString?: string } | undefined;
  const release =
    albumDate?.isoString || album?.release_date || album?.date || raw?.addedAt || null;
  const id =
    (typeof track?.id === "string" ? track.id : null) ||
    (uri && String(uri).includes(":track:") ? String(uri).split(":").pop() : null) ||
    null;

  const duration =
    (track?.duration as { milliseconds?: number } | undefined)?.milliseconds ??
    track?.duration_ms ??
    raw?.durationMs ??
    0;

  const row = blank({
    uri,
    uid,
    id,
    name: String(track?.name || raw?.name || "Unknown"),
    artists: artistsDisplay(artistList),
    artistIds: artistIdsFromList(artistList),
    album: String(album?.name || raw?.albumName || ""),
    albumId:
      (typeof album?.id === "string" ? album.id : null) ||
      (album?.uri && String(album.uri).includes(":album:")
        ? String(album.uri).split(":").pop()
        : null) ||
      null,
    albumUri: typeof album?.uri === "string" ? album.uri : null,
    durationMs: Number(duration) || 0,
    explicit: !!(track?.explicit || raw?.explicit),
    addedAt: (raw?.addedAt || raw?.added_at || track?.addedAt || null) as string | null,
    year: yearFromRelease(release),
    bpm: normalizeBpm(bpm),
    key: nativeKey?.camelot || null,
  });
  const spotifyBpm =
    raw?.bpm != null || track?.bpm != null || attrs?.bpm != null ? bpm : null;
  applyNativeAudioAttrs(row, nativeKey, spotifyBpm as number | string | null);
  if (row.bpm != null && spotifyBpm != null) row.bpmNative = true;
  return row;
}

/** Web API search track object. */
export function fromWebApiTrack(
  raw: Record<string, unknown> | null | undefined,
  index: number
): TrackRow {
  const track = (raw?.track || raw || {}) as Record<string, unknown>;
  const artists = Array.isArray(track?.artists) ? track.artists : [];
  const album = (track?.album || {}) as Record<string, unknown>;
  const id =
    (typeof track?.id === "string" ? track.id : null) ||
    trackIdFromUri(typeof track?.uri === "string" ? track.uri : null);
  const uri =
    (typeof track?.uri === "string" ? track.uri : "") ||
    (id ? "spotify:track:" + id : "");
  const release = album?.release_date || album?.date || null;
  const duration =
    track?.duration_ms ??
    (track?.duration as { milliseconds?: number } | undefined)?.milliseconds ??
    0;
  return blank({
    uri,
    uid: "search:" + (id || uri || index) + ":" + index,
    id,
    name: String(track?.name || "Unknown"),
    artists: artistsDisplay(artists),
    artistIds: artistIdsFromList(artists),
    album: String(album?.name || ""),
    albumId: typeof album?.id === "string" ? album.id : null,
    albumUri: typeof album?.uri === "string" ? album.uri : null,
    durationMs: Number(duration) || 0,
    explicit: !!track?.explicit,
    year: yearFromRelease(release),
    bpm: null,
    key: null,
    addedAt: null,
  });
}

function artistNamesFromGraphql(data: Record<string, unknown>): string[] {
  const raw = data?.artists;
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { items?: unknown[] }).items)
  ) {
    return (raw as { items: unknown[] }).items
      .map((a) => {
        const o = a as { profile?: { name?: string }; name?: string };
        return o?.profile?.name || o?.name;
      })
      .filter(Boolean) as string[];
  }
  if (Array.isArray(raw)) {
    return raw
      .map((a) => {
        if (typeof a === "string") return a;
        const o = a as { profile?: { name?: string }; name?: string };
        return o?.profile?.name || o?.name;
      })
      .filter(Boolean) as string[];
  }
  const artist = data?.artist as { profile?: { name?: string } } | undefined;
  if (artist?.profile?.name) return [artist.profile.name];
  if (typeof data?.artistName === "string") return [data.artistName];
  return [];
}

function artistIdsFromGraphql(data: Record<string, unknown>): string[] {
  const raw = data?.artists;
  const list = Array.isArray((raw as { items?: unknown[] })?.items)
    ? (raw as { items: unknown[] }).items
    : Array.isArray(raw)
      ? raw
      : [];
  return list
    .map((a) => {
      const o = a as { id?: string; uri?: string };
      return o?.id || idFromSpotifyUri(o?.uri);
    })
    .filter(Boolean) as string[];
}

/** Pathfinder / searchV2 track entity. */
export function fromGraphqlTrack(
  data: Record<string, unknown> | null | undefined,
  index: number
): TrackRow | null {
  if (!data) return null;
  const uri =
    (typeof data.uri === "string" ? data.uri : "") ||
    (typeof data.id === "string" ? "spotify:track:" + data.id : "");
  if (!uri || !String(uri).includes(":track:")) return null;
  const id = (typeof data.id === "string" ? data.id : null) || trackIdFromUri(uri);
  const album = (data.albumOfTrack || data.album || {}) as Record<string, unknown>;
  const durationObj = data.duration as
    { totalMilliseconds?: number; milliseconds?: number } | undefined;
  const trackDuration = data.trackDuration as
    { totalMilliseconds?: number; milliseconds?: number } | undefined;
  const durationMs =
    durationObj?.totalMilliseconds ??
    durationObj?.milliseconds ??
    trackDuration?.totalMilliseconds ??
    trackDuration?.milliseconds ??
    data.duration_ms ??
    data.durationMs ??
    0;
  const rating =
    (data.contentRating as { label?: string } | undefined)?.label ||
    data.contentRating ||
    "";
  const explicit = !!data.explicit || String(rating).toUpperCase() === "EXPLICIT";
  const albumDate = album?.date as { isoString?: string; year?: number } | undefined;
  const release =
    albumDate?.isoString || albumDate?.year || album?.release_date || null;
  return blank({
    uri,
    uid: "search:" + (id || uri) + ":" + index,
    id,
    name: String(data.name || data.title || "Unknown"),
    artists: artistNamesFromGraphql(data).join(", "),
    artistIds: artistIdsFromGraphql(data),
    album: String(album?.name || ""),
    albumId:
      (typeof album?.id === "string" ? album.id : null) ||
      idFromSpotifyUri(typeof album?.uri === "string" ? album.uri : null) ||
      null,
    albumUri: typeof album?.uri === "string" ? album.uri : null,
    durationMs: Number(durationMs) || 0,
    explicit,
    year: yearFromRelease(release),
    bpm: null,
    key: null,
    addedAt: null,
  });
}

/**
 * Catalog / recommendation row → playlist working-copy track.
 * Preserves enrichment fields when present.
 */
export function forAppend(
  track: Partial<TrackRow> | null | undefined,
  stamp?: number
): TrackRow {
  const ts = stamp == null ? Date.now() : stamp;
  const id = track?.id || trackIdFromUri(track?.uri);
  const core = blank({
    uri: track?.uri || "",
    uid: `added:${track?.uri}:${ts}`,
    id: id ?? null,
    name: track?.name || "Unknown",
    artists: track?.artists || "",
    artistIds: track?.artistIds || [],
    album: track?.album || "",
    albumId: track?.albumId ?? null,
    albumUri: track?.albumUri ?? null,
    durationMs: track?.durationMs || 0,
    explicit: !!track?.explicit,
    addedAt: new Date().toISOString(),
    year: track?.year ?? null,
    bpm: track?.bpm ?? null,
    key: track?.key ?? null,
  });
  for (const k of FEATURE_KEYS) {
    if (track && track[k] != null) {
      (core as Record<string, unknown>)[k] = track[k];
    }
  }
  if (track?.keyNative) core.keyNative = true;
  if (track?.bpmNative) core.bpmNative = true;
  if (track?.keyColor) core.keyColor = track.keyColor;
  if (track?.standardKey) core.standardKey = track.standardKey;
  if (track?.standardMode) core.standardMode = track.standardMode;
  return core;
}
