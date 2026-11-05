/**
 * AudioAttributesV2 + enrich cache I/O.
 * Prefers Platform MetadataExtensions / spclient; Web API audio-features last resort (ADR 009).
 * Split from legacy api/features.js per ADR 005.
 */

import {
  applyNativeAudioAttrs,
  coerceSpotifyTrackKey,
  trackIdFromUri,
} from "../domain/track.ts";
import {
  formatKeyLabel,
  formatStandardKey,
  indexModeFromCamelotLabel,
  looksLikeCamelotLabel,
  normalizeMode,
  standardFromPitchMode,
} from "../domain/key.ts";
import type { NativeKeyInfo, TrackRow } from "../types/track.ts";
import * as Http from "./http.ts";

const CACHE = new Map<string, FeatureSample | null>();
const BATCH = 50;
const SPCLIENT = "https://spclient.wg.spotify.com/audio-attributes/v1/audio-features";
/** Last resort when spclient audio-attributes fails (ADR 009). */
const WEB_FEATURES = "https://api.spotify.com/v1/audio-features";

/** Spotify MetadataExtensions extension id for playlist Key/BPM. */
export const AUDIO_ATTRIBUTES_V2 = 222;

export type FeatureSample = {
  [key: string]: unknown;
  key: number | unknown;
  mode: 0 | 1 | null;
  tempo?: number | null;
  acousticness?: number | null;
  danceability?: number | null;
  energy?: number | null;
  instrumentalness?: number | null;
  liveness?: number | null;
  loudness?: number | null;
  speechiness?: number | null;
  valence?: number | null;
  popularity?: number | null;
  time_signature?: number | null;
  duration_ms?: number | null;
  nativeKey?: NativeKeyInfo | null;
  bpmNative?: number | null;
};

export type ParsedAudioAttrsV2 = {
  keyInfo: NativeKeyInfo | null;
  bpm: number | null;
};

/** Locate Spotify MetadataExtensionsAPI (fetch + expire). */
function findMetadataExtensionsAPI(): {
  fetch: (...args: unknown[]) => Promise<unknown>;
  expire?: (...args: unknown[]) => void;
} | null {
  const P = Spicetify?.Platform as Record<string, unknown> | undefined;
  if (!P || typeof P !== "object") return null;
  for (const name of ["MetadataExtensionsAPI", "MetadataService", "MetadataAPI"]) {
    const api = P[name] as { fetch?: unknown; expire?: unknown } | undefined;
    if (api && typeof api.fetch === "function") {
      return api as {
        fetch: (...args: unknown[]) => Promise<unknown>;
        expire?: (...args: unknown[]) => void;
      };
    }
  }
  try {
    for (const key of Object.keys(P)) {
      const api = P[key] as { fetch?: unknown; expire?: unknown } | undefined;
      if (api && typeof api.fetch === "function" && typeof api.expire === "function") {
        return api as {
          fetch: (...args: unknown[]) => Promise<unknown>;
          expire?: (...args: unknown[]) => void;
        };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Normalize AudioAttributesV2 payload → native key/BPM fields.
 */
export function parseAudioAttributesV2(raw: unknown): ParsedAudioAttrsV2 | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const keyInfo = coerceSpotifyTrackKey(
    (obj.key || obj.trackKey || raw) as Parameters<typeof coerceSpotifyTrackKey>[0]
  );
  const bpm = obj.bpm != null ? Math.round(Number(obj.bpm)) : null;
  if (!keyInfo && (bpm == null || Number.isNaN(bpm))) return null;
  return {
    keyInfo,
    bpm: bpm != null && !Number.isNaN(bpm) ? bpm : null,
  };
}

/**
 * Fetch AudioAttributesV2 for track URIs (same source as playlist Key/BPM).
 */
export async function fetchAudioAttributesV2Map(
  uris: string[] | null | undefined
): Promise<Map<string, ParsedAudioAttrsV2>> {
  const out = new Map<string, ParsedAudioAttrsV2>();
  const unique = [
    ...new Set((uris || []).filter((u) => u && String(u).includes(":track:"))),
  ];
  if (!unique.length) return out;

  const api = findMetadataExtensionsAPI();
  if (!api?.fetch) return out;

  const CHUNK = 50;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    try {
      const args = chunk.map((uri) => [uri, AUDIO_ATTRIBUTES_V2]);
      const res = (await api.fetch(...args)) as Record<string, unknown> | null;
      if (!res || typeof res !== "object") continue;
      for (const uri of chunk) {
        const byUri = res[uri] as Record<string, unknown> | undefined;
        if (!byUri) continue;
        const raw =
          byUri[AUDIO_ATTRIBUTES_V2] ||
          byUri.AUDIO_ATTRIBUTES_V2 ||
          byUri.AudioAttributesV2 ||
          byUri;
        const parsed = parseAudioAttributesV2(raw);
        if (parsed) out.set(uri, parsed);
      }
    } catch (err) {
      console.warn("Weave: AudioAttributesV2 fetch failed", err);
      break;
    }
  }
  return out;
}

function pickSample(feat: unknown): FeatureSample | null {
  if (!feat || typeof feat !== "object") return null;
  const f = feat as Record<string, unknown>;
  const key = typeof f.key === "number" ? f.key : Number(f.key);
  const mode = normalizeMode(f.mode);
  const nativeKey = coerceSpotifyTrackKey(
    (f.trackKey ||
      f.camelot_key ||
      f.camelotKey ||
      (f.camelot || f.standard_key || f.standardKey ? f : null)) as Parameters<
      typeof coerceSpotifyTrackKey
    >[0]
  );
  return {
    key: Number.isFinite(key) ? key : f.key,
    mode,
    tempo: f.tempo as number | null | undefined,
    acousticness: f.acousticness as number | null | undefined,
    danceability: f.danceability as number | null | undefined,
    energy: f.energy as number | null | undefined,
    instrumentalness: f.instrumentalness as number | null | undefined,
    liveness: f.liveness as number | null | undefined,
    loudness: f.loudness as number | null | undefined,
    speechiness: f.speechiness as number | null | undefined,
    valence: f.valence as number | null | undefined,
    popularity: f.popularity as number | null | undefined,
    time_signature: (f.time_signature ?? f.timeSignature) as number | null | undefined,
    duration_ms: (f.duration_ms ?? f.durationMs) as number | null | undefined,
    nativeKey,
    bpmNative: f.bpm != null && f.tempo == null ? Math.round(Number(f.bpm)) : null,
  };
}

async function fetchBatch(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const missing = ids.filter((id) => !CACHE.has(id));
  for (let i = 0; i < missing.length; i += BATCH) {
    if (Http.isCoolingDown()) break;

    const chunk = missing.slice(i, i + BATCH);
    let list: unknown[] | null = null;

    try {
      const res = (await Http.cosmosGet(SPCLIENT + "?ids=" + chunk.join(","), {
        retries: 2,
        label: "audio-attributes",
        notifyUser: false,
        failFastOnCooldown: true,
      })) as { audio_features?: unknown[]; audioFeatures?: unknown[] };
      list = res?.audio_features || res?.audioFeatures || null;
    } catch (err) {
      console.warn("Weave: audio-attributes batch failed", err);
      if (Http.isRateLimitError(err)) break;
    }

    if (!list && !Http.isCoolingDown()) {
      try {
        // Last resort: Web API /v1/audio-features when spclient fails (ADR 009).
        const res = (await Http.cosmosGet(WEB_FEATURES + "?ids=" + chunk.join(","), {
          retries: 2,
          label: "audio-features",
          notifyUser: false,
          failFastOnCooldown: true,
        })) as { audio_features?: unknown[] };
        list = res?.audio_features || null;
      } catch (err) {
        console.warn("Weave: /v1/audio-features batch failed", err);
        if (Http.isRateLimitError(err)) break;
      }
    }

    for (let j = 0; j < chunk.length; j++) {
      const sample = pickSample(list?.[j]);
      if (sample && (typeof sample.key === "number" || sample.energy != null)) {
        CACHE.set(chunk[j], sample);
      } else {
        CACHE.set(chunk[j], null);
      }
    }
  }
}

export async function getFeatureSamples(
  ids: string[] | null | undefined
): Promise<FeatureSample[]> {
  const unique = [...new Set((ids || []).filter(Boolean))];
  await fetchBatch(unique);
  return unique.map((id) => CACHE.get(id)).filter(Boolean) as FeatureSample[];
}

export async function getFeatureSampleMap(
  ids: string[] | null | undefined
): Promise<Map<string, FeatureSample>> {
  const unique = [...new Set((ids || []).filter(Boolean))];
  await fetchBatch(unique);
  const map = new Map<string, FeatureSample>();
  for (const id of unique) {
    const sample = CACHE.get(id);
    if (sample) map.set(id, sample);
  }
  return map;
}

export function cacheSize(): number {
  return CACHE.size;
}

function applyNativeParsed(track: TrackRow, parsed: ParsedAudioAttrsV2): void {
  applyNativeAudioAttrs(track, parsed.keyInfo, parsed.bpm);
  if (track.key) {
    const idx = indexModeFromCamelotLabel(track.key);
    if (idx) {
      track.keyIndex = idx.key;
      track.keyMode = idx.mode;
    }
  }
}

/**
 * Spotify playlist mixing notation preference (LocalStorageAPI).
 * Default matches Spotify: Camelot on, standard off.
 */
export function getNotationPreference(): { camelot: boolean; standard: boolean } {
  try {
    const raw = Spicetify?.Platform?.LocalStorageAPI?.getItem?.(
      "key-notation-preference"
    ) as { camelot?: boolean; standard?: boolean } | null;
    if (raw && typeof raw === "object") {
      const camelot = !!raw.camelot;
      const standard = !!raw.standard;
      if (camelot || standard) return { camelot, standard };
    }
  } catch {
    /* ignore */
  }
  return { camelot: true, standard: false };
}

/**
 * Display string for the Key column — same rules as Spotify's playlist Key cell.
 * track.key stays Camelot for filters; standardKey / pitch used for notation.
 */
export function formatDisplayKey(track: TrackRow | null | undefined): string | null {
  if (!track) return null;
  const pref = getNotationPreference();
  const camelot = looksLikeCamelotLabel(track.key) ? String(track.key) : null;
  const standard =
    formatStandardKey(track.standardKey, track.standardMode) ||
    standardFromPitchMode(track.keyIndex, track.keyMode) ||
    null;

  if (pref.camelot && pref.standard) {
    if (camelot && standard) return camelot + " • " + standard;
    return camelot || standard;
  }
  if (pref.standard && !pref.camelot) return standard || camelot;
  return camelot || standard;
}

/**
 * Enrich track objects with key/BPM + full feature fields.
 * Mutates and returns the same array reference.
 * Prefers Spotify AudioAttributesV2 (playlist Key/BPM) over audio-features.
 */
export async function enrichTracks(
  tracks: TrackRow[] | null | undefined
): Promise<TrackRow[]> {
  if (!tracks?.length) return tracks || [];

  const needV2: string[] = [];
  for (const t of tracks) {
    if (!t?.uri) continue;
    if (t.keyNative && t.bpmNative) continue;
    needV2.push(t.uri);
  }
  if (needV2.length) {
    const v2map = await fetchAudioAttributesV2Map(needV2);
    for (const t of tracks) {
      const parsed = t?.uri ? v2map.get(t.uri) : null;
      if (parsed) applyNativeParsed(t, parsed);
    }
  }

  const ids: string[] = [];
  for (const t of tracks) {
    const id = t.id || trackIdFromUri(t.uri);
    if (id) ids.push(id);
  }
  await fetchBatch([...new Set(ids)]);
  for (const t of tracks) {
    const id = t.id || trackIdFromUri(t.uri);
    const feat = id ? CACHE.get(id) : null;
    const keepNativeKey = t.keyNative === true && looksLikeCamelotLabel(t.key);
    const keepNativeBpm = t.bpmNative === true && t.bpm != null;

    if (!feat) {
      if (!keepNativeBpm && t.bpm == null) t.bpm = null;
      if (!keepNativeKey && t.key == null) t.key = null;
      if (keepNativeKey && t.key) {
        const idx = indexModeFromCamelotLabel(t.key);
        if (idx) {
          t.keyIndex = idx.key;
          t.keyMode = idx.mode;
        }
      }
      t.featuresLoaded = keepNativeKey || keepNativeBpm;
      continue;
    }
    t.featuresLoaded = true;
    t.energy = feat.energy;
    t.danceability = feat.danceability;
    t.valence = feat.valence;
    t.acousticness = feat.acousticness;
    t.instrumentalness = feat.instrumentalness;
    t.speechiness = feat.speechiness;
    t.liveness = feat.liveness;
    t.loudness = feat.loudness;
    t.tempo = feat.tempo;
    t.popularity = feat.popularity ?? t.popularity;

    if (keepNativeBpm) {
      // keep Spotify V2 BPM
    } else if (feat.tempo != null && !Number.isNaN(feat.tempo)) {
      t.bpm = Math.round(feat.tempo);
      t.bpmNative = false;
    } else if (t.bpm == null) {
      t.bpm = null;
    }

    if (keepNativeKey && t.key) {
      t.keyNative = true;
      const idx = indexModeFromCamelotLabel(t.key);
      if (idx) {
        t.keyIndex = idx.key;
        t.keyMode = idx.mode;
      } else if (typeof feat.key === "number") {
        t.keyIndex = feat.key;
        t.keyMode = feat.mode;
      }
      if (!t.standardKey) {
        t.standardKey = standardFromPitchMode(t.keyIndex, t.keyMode);
        t.standardMode = normalizeMode(t.keyMode) === 0 ? "minor" : "major";
      }
    } else if (feat.nativeKey) {
      applyNativeAudioAttrs(t, feat.nativeKey, feat.bpmNative);
      if (t.key) {
        const idx = indexModeFromCamelotLabel(t.key);
        if (idx) {
          t.keyIndex = idx.key;
          t.keyMode = idx.mode;
        }
      }
      if (!t.standardKey) {
        t.standardKey = standardFromPitchMode(
          typeof feat.key === "number" ? feat.key : null,
          feat.mode
        );
        t.standardMode = normalizeMode(feat.mode) === 0 ? "minor" : "major";
      }
    } else {
      t.keyIndex = typeof feat.key === "number" ? feat.key : null;
      t.keyMode = feat.mode;
      t.key = formatKeyLabel(feat.key, feat.mode);
      t.keyNative = false;
      t.standardKey = standardFromPitchMode(
        typeof feat.key === "number" ? feat.key : null,
        feat.mode
      );
      t.standardMode = normalizeMode(feat.mode) === 0 ? "minor" : "major";
    }
  }
  return tracks;
}

export function reformatTrackKeys(
  tracks: TrackRow[] | null | undefined
): TrackRow[] | null | undefined {
  for (const t of tracks || []) {
    if (t.keyNative && looksLikeCamelotLabel(t.key)) {
      if (t.keyIndex == null || t.keyMode == null) {
        const idx = indexModeFromCamelotLabel(t.key);
        if (idx) {
          t.keyIndex = idx.key;
          t.keyMode = idx.mode;
        }
      }
      if (!t.standardKey) {
        t.standardKey = standardFromPitchMode(t.keyIndex, t.keyMode) || t.standardKey;
      }
      continue;
    }
    if (t.keyIndex == null) continue;
    t.key = formatKeyLabel(t.keyIndex, t.keyMode);
    if (!t.standardKey) {
      t.standardKey = standardFromPitchMode(t.keyIndex, t.keyMode);
      t.standardMode = normalizeMode(t.keyMode) === 0 ? "minor" : "major";
    }
  }
  return tracks;
}
