/**
 * Playlist membership + append helpers.
 * URI / id / fingerprint identity — uses domain/track only (ADR 004).
 */

import type { AppendResult, TrackRow } from "../types/track.ts";
import { forAppend, trackFingerprint, trackIdFromUri } from "./track.ts";

export type EnrichTracksFn = (
  tracks: TrackRow[]
) => Promise<void | TrackRow[] | null | undefined>;

function trackId(track: Partial<TrackRow> | null | undefined): string | null {
  if (!track) return null;
  return track.id || trackIdFromUri(track.uri) || null;
}

function fingerprint(track: Partial<TrackRow> | null | undefined): string | null {
  return trackFingerprint(track) || null;
}

/** True when a and b are the same song (uri, id, or fingerprint). */
export function isSameTrack(
  a: Partial<TrackRow> | null | undefined,
  b: Partial<TrackRow> | null | undefined
): boolean {
  if (!a || !b) return false;
  if (a.uri && b.uri && a.uri === b.uri) return true;
  const idA = trackId(a);
  const idB = trackId(b);
  if (idA && idB && String(idA) === String(idB)) return true;
  const fpA = fingerprint(a);
  const fpB = fingerprint(b);
  if (fpA && fpB && fpA === fpB) return true;
  return false;
}

/**
 * Index of tracks already in the playlist for O(1) membership checks.
 * Keys: raw URI, `id:<id>`, `fp:<fingerprint>`.
 */
export function buildExistingIndex(
  tracks: Array<Partial<TrackRow> | null | undefined>
): Set<string> {
  const s = new Set<string>();
  for (const t of tracks || []) {
    if (!t) continue;
    if (t.uri) s.add(t.uri);
    const id = trackId(t);
    if (id) s.add("id:" + id);
    const fp = fingerprint(t);
    if (fp) s.add("fp:" + fp);
  }
  return s;
}

export function isInIndex(
  index: Set<string> | null | undefined,
  track: Partial<TrackRow> | null | undefined
): boolean {
  if (!track || !index) return false;
  if (track.uri && index.has(track.uri)) return true;
  const id = trackId(track);
  if (id && index.has("id:" + id)) return true;
  const fp = fingerprint(track);
  if (fp && index.has("fp:" + fp)) return true;
  return false;
}

export function isInPlaylist(
  track: Partial<TrackRow> | null | undefined,
  list: Array<Partial<TrackRow> | null | undefined>
): boolean {
  if (!track?.uri) return true;
  return isInIndex(buildExistingIndex(list), track);
}

/** Absorb a track into an existing index (mutates). */
export function absorbIntoIndex(
  index: Set<string> | null | undefined,
  track: Partial<TrackRow> | null | undefined
): void {
  if (!index || !track) return;
  if (track.uri) index.add(track.uri);
  const id = trackId(track);
  if (id) index.add("id:" + id);
  const fp = fingerprint(track);
  if (fp) index.add("fp:" + fp);
}

/** Catalog / rec track → arranger playlist shape. */
export function toPlaylistTrack(
  track: Partial<TrackRow> | null | undefined,
  stamp?: number
): TrackRow {
  return forAppend(track, stamp);
}

/**
 * Append incoming tracks that are not already present.
 */
export function appendTracks(
  current: TrackRow[],
  incoming: Array<Partial<TrackRow> | null | undefined>
): AppendResult {
  const working = Array.isArray(current) ? current.slice() : [];
  const index = buildExistingIndex(working);
  const added: TrackRow[] = [];
  const skipped: Array<Partial<TrackRow> | null | undefined> = [];
  const list = Array.isArray(incoming) ? incoming : [];
  const stamp = Date.now();

  for (let i = 0; i < list.length; i++) {
    const track = list[i];
    if (!track?.uri) {
      skipped.push(track);
      continue;
    }
    if (isInIndex(index, track)) {
      skipped.push(track);
      continue;
    }
    const next = toPlaylistTrack(track, stamp + i);
    working.push(next);
    added.push(next);
    absorbIntoIndex(index, next);
  }

  return { next: working, added, skipped };
}

/**
 * Background enrich of newly added rows.
 * Pass `enrichTracks` from api/features; no-op if omitted.
 * Never swallows errors with an empty catch (ADR 006) — warn + optional onError.
 */
export function enrichAdded(
  addedTracks: TrackRow[],
  setTracks: (updater: (prev: TrackRow[]) => TrackRow[]) => void,
  enrichTracks?: EnrichTracksFn,
  onError?: (err: unknown) => void
): void {
  const list = Array.isArray(addedTracks) ? addedTracks : [];
  if (
    !list.length ||
    typeof setTracks !== "function" ||
    typeof enrichTracks !== "function"
  ) {
    return;
  }
  enrichTracks(list.slice())
    .then(() => {
      const byUid = new Map(list.map((t) => [t.uid, t]));
      setTracks((prev) =>
        prev.map((t) => {
          const n = byUid.get(t.uid);
          return n
            ? {
                ...t,
                bpm: n.bpm ?? t.bpm,
                key: n.key ?? t.key,
                keyNative: n.keyNative || t.keyNative,
                bpmNative: n.bpmNative || t.bpmNative,
                keyColor: n.keyColor || t.keyColor,
                standardKey: n.standardKey || t.standardKey,
                standardMode: n.standardMode || t.standardMode,
                keyIndex: n.keyIndex ?? t.keyIndex,
                keyMode: n.keyMode ?? t.keyMode,
              }
            : t;
        })
      );
    })
    .catch((err: unknown) => {
      console.warn("Weave: enrichAdded failed", err);
      try {
        onError?.(err);
      } catch (notifyErr) {
        console.warn("Weave: enrichAdded onError failed", notifyErr);
      }
    });
}

/** True when uid is Weave-synthetic / not a Spotify playlist-item uid. */
export function isProvisionalPlaylistUid(uid: string | null | undefined): boolean {
  if (!uid) return true;
  const s = String(uid);
  if (s.startsWith("added:") || s.startsWith("rec:") || s.startsWith("web:")) {
    return true;
  }
  if (/^spotify:(track|episode):[^:]+:\d+$/.test(s)) return true;
  return false;
}

/**
 * After addTracks reload: keep local order/enrichment; attach real Spotify uids.
 */
export function mergeTracksAfterRemoteAdd(
  localTracks: TrackRow[],
  remoteTracks: TrackRow[]
): TrackRow[] {
  const remote = Array.isArray(remoteTracks) ? remoteTracks : [];
  const byUri = new Map<string, TrackRow[]>();
  for (const t of remote) {
    if (!t?.uri) continue;
    if (!byUri.has(t.uri)) byUri.set(t.uri, []);
    byUri.get(t.uri)!.push(t);
  }
  const used = new Set<string>();
  return (Array.isArray(localTracks) ? localTracks : []).map((local) => {
    if (!local) return local;
    if (local.uid && !isProvisionalPlaylistUid(local.uid)) {
      const hit = remote.find((r) => r && r.uid === local.uid && !used.has(r.uid));
      if (hit) {
        used.add(hit.uid);
        return { ...local, uid: hit.uid };
      }
    }
    const queue = byUri.get(local.uri);
    if (queue && queue.length) {
      while (queue.length) {
        const hit = queue.shift();
        if (!hit?.uid || used.has(hit.uid)) continue;
        used.add(hit.uid);
        return { ...local, uid: hit.uid };
      }
    }
    return local;
  });
}

/** Stable identity for one playlist row (prefer Spotify item uid, else track uri). */
export function trackOrderKey(track: Partial<TrackRow> | null | undefined): string {
  if (!track) return "";
  if (track.uid) return "u:" + String(track.uid);
  if (track.uri) return "r:" + String(track.uri);
  return "";
}

/** Fingerprint of membership + order for sync checks. */
export function fingerprintTrackOrder(
  tracks: Array<Partial<TrackRow> | null | undefined>
): string {
  return (Array.isArray(tracks) ? tracks : [])
    .map(trackOrderKey)
    .filter(Boolean)
    .join("\n");
}

/** Re-export for callers that used WeavePlaylistOps.trackId / fingerprint. */
export { trackId, fingerprint };
