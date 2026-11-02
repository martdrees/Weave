//@ts-check
/**
 * Playlist membership + append helpers (R1.2).
 * URI / id / fingerprint identity shared by session, Add Track, and Copy.
 */

const WeavePlaylistOps = (() => {
  function trackId(track) {
    if (!track) return null;
    return track.id || WeaveRecommend.trackIdFromUri?.(track.uri) || null;
  }

  function fingerprint(track) {
    return WeaveRecommend.trackFingerprint?.(track) || null;
  }

  /** True when a and b are the same song (uri, id, or fingerprint). */
  function isSameTrack(a, b) {
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
   * @returns {Set<string>}
   */
  function buildExistingIndex(tracks) {
    const s = new Set();
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

  function isInIndex(index, track) {
    if (!track || !index) return false;
    if (track.uri && index.has(track.uri)) return true;
    const id = trackId(track);
    if (id && index.has("id:" + id)) return true;
    const fp = fingerprint(track);
    if (fp && index.has("fp:" + fp)) return true;
    return false;
  }

  function isInPlaylist(track, list) {
    if (!track?.uri) return true;
    return isInIndex(buildExistingIndex(list), track);
  }

  /** Absorb a track into an existing index (mutates). */
  function absorbIntoIndex(index, track) {
    if (!index || !track) return;
    if (track.uri) index.add(track.uri);
    const id = trackId(track);
    if (id) index.add("id:" + id);
    const fp = fingerprint(track);
    if (fp) index.add("fp:" + fp);
  }

  /**
   * Catalog / rec track → arranger playlist shape (canonical Track).
   * @param {object} track
   * @param {number} [stamp]
   */
  function toPlaylistTrack(track, stamp) {
    return WeaveTrack.forAppend(track, stamp);
  }

  /**
   * Append incoming tracks that are not already present.
   * @param {WeaveTrackRow[]} current
   * @param {Array<Partial<WeaveTrackRow>|null|undefined>} incoming
   * @returns {WeaveAppendResult & { skipped: WeaveTrackRow[] }}
   */
  function appendTracks(current, incoming) {
    const working = Array.isArray(current) ? current.slice() : [];
    const index = buildExistingIndex(working);
    const added = [];
    const skipped = [];
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
   * Background enrich of newly added rows; merges bpm/key via setTracks patcher.
   * @param {object[]} addedTracks
   * @param {(updater: (prev: object[]) => object[]) => void} setTracks
   */
  function enrichAdded(addedTracks, setTracks) {
    const list = Array.isArray(addedTracks) ? addedTracks : [];
    if (!list.length || typeof setTracks !== "function") return;
    WeaveFeatures.enrichTracks(list.slice())
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
      .catch(() => {});
  }

  /**
   * True when uid is Weave-synthetic / not a Spotify playlist-item uid.
   * @param {string|null|undefined} uid
   */
  function isProvisionalPlaylistUid(uid) {
    if (!uid) return true;
    const s = String(uid);
    if (s.startsWith("added:") || s.startsWith("rec:") || s.startsWith("web:")) {
      return true;
    }
    // normalizeTrack / forAppend fallback: `${uri}:${index}`
    if (/^spotify:(track|episode):[^:]+:\d+$/.test(s)) return true;
    return false;
  }

  /**
   * After addTracks reload: keep local order/enrichment; attach real Spotify uids.
   * @param {WeaveTrackRow[]} localTracks
   * @param {WeaveTrackRow[]} remoteTracks
   * @returns {WeaveTrackRow[]}
   */
  function mergeTracksAfterRemoteAdd(localTracks, remoteTracks) {
    const remote = Array.isArray(remoteTracks) ? remoteTracks : [];
    const byUri = new Map();
    for (const t of remote) {
      if (!t?.uri) continue;
      if (!byUri.has(t.uri)) byUri.set(t.uri, []);
      byUri.get(t.uri).push(t);
    }
    const used = new Set();
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

  /**
   * Stable identity for one playlist row (prefer Spotify item uid, else track uri).
   * Used for remote-sync comparison — ignores enrich-only fields.
   */
  function trackOrderKey(track) {
    if (!track) return "";
    if (track.uid) return "u:" + String(track.uid);
    if (track.uri) return "r:" + String(track.uri);
    return "";
  }

  /** Fingerprint of membership + order for sync checks. */
  function fingerprintTrackOrder(tracks) {
    return (Array.isArray(tracks) ? tracks : [])
      .map(trackOrderKey)
      .filter(Boolean)
      .join("\n");
  }

  return {
    trackId,
    fingerprint,
    isSameTrack,
    buildExistingIndex,
    isInIndex,
    isInPlaylist,
    absorbIntoIndex,
    toPlaylistTrack,
    appendTracks,
    enrichAdded,
    isProvisionalPlaylistUid,
    mergeTracksAfterRemoteAdd,
    trackOrderKey,
    fingerprintTrackOrder,
  };
})();
