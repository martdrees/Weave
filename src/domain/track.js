//@ts-check
/**
 * Canonical Weave track shape + Spotify anti-corruption adapters (R3.2).
 * See docs/TRACK.md.
 */

const MixAppTrack = (() => {
  /** @type {readonly string[]} */
  const CORE_KEYS = Object.freeze([
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
  ]);

  /** Enrichment keys written by MixAppFeatures.enrichTracks. */
  const FEATURE_KEYS = Object.freeze([
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
  ]);

  function idFromSpotifyUri(uri) {
    if (!uri) return null;
    return String(uri).split(":").pop() || null;
  }

  function trackIdFromUri(uri) {
    if (!uri || !String(uri).includes(":track:")) return null;
    return idFromSpotifyUri(uri);
  }

  function pickAttr(obj, ...keys) {
    if (!obj) return null;
    for (const key of keys) {
      const v = obj[key];
      if (v != null && v !== "") return v;
    }
    return null;
  }

  function yearFromRelease(release) {
    if (release == null || release === "") return null;
    const y = parseInt(String(release).slice(0, 4), 10);
    return Number.isFinite(y) ? y : null;
  }

  function artistsDisplay(list) {
    return (Array.isArray(list) ? list : [])
      .map((a) => a?.name || a)
      .filter(Boolean)
      .join(", ");
  }

  function artistIdsFromList(list) {
    return (Array.isArray(list) ? list : [])
      .map((a) => a?.id || (a?.uri ? String(a.uri).split(":").pop() : null))
      .filter(Boolean);
  }

  function normalizeBpm(bpm) {
    if (bpm == null) return null;
    if (typeof bpm === "number") {
      return Number.isFinite(bpm) ? Math.round(bpm) : null;
    }
    const n = parseFloat(String(bpm));
    return Number.isFinite(n) ? Math.round(n) : String(bpm);
  }

  /** AudioAttributesV2 mode enum (not Web API 0/1). */
  const V2_MODE_MINOR = 1;
  const V2_MODE_MAJOR = 2;

  /**
   * Spotify playlist Key column uses AudioAttributesV2 → mapped trackKey:
   * { standardKey, mode: "minor"|"major", camelotKey, color }.
   * Raw extension shape: { key, mode: 1|2, camelotKey: { value, color } }.
   * @returns {{
   *   camelot: string|null,
   *   standardKey: string|null,
   *   mode: "minor"|"major"|null,
   *   color: string|null,
   *   native: true
   * }|null}
   */
  function coerceSpotifyTrackKey(value) {
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

    const camelotRaw =
      (typeof value.camelotKey === "string" && value.camelotKey) ||
      (value.camelotKey &&
        typeof value.camelotKey === "object" &&
        value.camelotKey.value) ||
      value.camelot ||
      null;
    let camelot = null;
    if (camelotRaw) {
      const m = String(camelotRaw).match(/(\d{1,2})\s*([ABab])/);
      if (m) camelot = parseInt(m[1], 10) + m[2].toUpperCase();
    }

    const standardRaw =
      (typeof value.standardKey === "string" && value.standardKey) ||
      (typeof value.key === "string" && value.key) ||
      null;
    const standardKey = standardRaw ? String(standardRaw).trim() || null : null;

    let mode = null;
    if (value.mode === "minor" || value.mode === "major") {
      mode = value.mode;
    } else if (value.mode === V2_MODE_MINOR || value.mode === "1") {
      mode = "minor";
    } else if (value.mode === V2_MODE_MAJOR || value.mode === "2") {
      mode = "major";
    }

    const color =
      value.color ||
      (value.camelotKey &&
        typeof value.camelotKey === "object" &&
        value.camelotKey.color) ||
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

  /**
   * Apply native Spotify key/BPM fields onto a track row.
   * @param {object} row
   * @param {{ camelot?: string|null, standardKey?: string|null, mode?: string|null, color?: string|null }|null} keyInfo
   * @param {number|string|null} [bpm]
   */
  function applyNativeAudioAttrs(row, keyInfo, bpm) {
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

  function extractPlaylistKey(raw, track, attrs) {
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

  /**
   * Empty / default core track. Optional enrichment keys omitted.
   * @param {Partial<MixAppTrackCore>} [partial]
   * @returns {MixAppTrackRow}
   */
  function blank(partial) {
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

  /**
   * Coerce a partial into a full core track (keeps unknown extra keys).
   * @param {Partial<MixAppTrackRow>|null|undefined} partial
   * @returns {MixAppTrackRow}
   */
  function ensure(partial) {
    const base = blank(partial);
    if (!partial || typeof partial !== "object") return base;
    const out = { ...partial, ...base };
    // Prefer non-empty values from partial when blank() defaulted.
    for (const k of CORE_KEYS) {
      if (partial[k] != null && partial[k] !== "") out[k] = partial[k];
    }
    if (!out.id && out.uri) out.id = trackIdFromUri(out.uri);
    if (out.key != null) out.key = String(out.key);
    out.explicit = !!out.explicit;
    out.durationMs = Number(out.durationMs) || 0;
    out.artistIds = Array.isArray(out.artistIds) ? out.artistIds : [];
    return out;
  }

  /**
   * Platform playlist row or Web API playlist /items row.
   * @param {object} raw
   * @param {number} index
   * @returns {MixAppTrackRow}
   */
  function fromPlaylistItem(raw, index) {
    const track = raw?.track || raw?.item || raw;
    const album = track?.album || raw?.album || {};
    const artists =
      track?.artists || raw?.artists || (track?.artist ? [track.artist] : []) || [];
    const uri = track?.uri || raw?.uri || "";
    const uid = raw?.uid || raw?.addTime || `${uri}:${index}`;
    const attrs = raw?.formatListAttributes || track?.formatListAttributes || {};
    const bpm =
      pickAttr(attrs, "bpm", "tempo", "musical-bpm") ??
      pickAttr(track, "bpm", "tempo") ??
      pickAttr(raw, "bpm", "tempo");
    const nativeKey = extractPlaylistKey(raw, track, attrs);
    const artistList = Array.isArray(artists) ? artists : [];
    const release =
      album?.date?.isoString ||
      album?.release_date ||
      album?.date ||
      raw?.addedAt ||
      null;
    const id =
      track?.id ||
      (uri && String(uri).includes(":track:") ? String(uri).split(":").pop() : null);

    const row = blank({
      uri,
      uid: String(uid),
      id,
      name: track?.name || raw?.name || "Unknown",
      artists: artistsDisplay(artistList),
      artistIds: artistIdsFromList(artistList),
      album: album?.name || raw?.albumName || "",
      albumId:
        album?.id ||
        (album?.uri && String(album.uri).includes(":album:")
          ? String(album.uri).split(":").pop()
          : null) ||
        null,
      albumUri: album?.uri || null,
      durationMs:
        track?.duration?.milliseconds ?? track?.duration_ms ?? raw?.durationMs ?? 0,
      explicit: !!(track?.explicit || raw?.explicit),
      addedAt: raw?.addedAt || raw?.added_at || track?.addedAt || null,
      year: yearFromRelease(release),
      bpm: normalizeBpm(bpm),
      key: nativeKey?.camelot || null,
    });
    // Any BPM on a Platform playlist row is Spotify's (V2 or formatListAttributes).
    const spotifyBpm =
      raw?.bpm != null || track?.bpm != null || attrs?.bpm != null
        ? bpm
        : null;
    applyNativeAudioAttrs(row, nativeKey, spotifyBpm);
    if (row.bpm != null && spotifyBpm != null) row.bpmNative = true;
    return row;
  }

  /**
   * Web API search track object.
   * @param {object} raw
   * @param {number} index
   * @returns {MixAppTrackRow}
   */
  function fromWebApiTrack(raw, index) {
    const track = raw?.track || raw;
    const artists = Array.isArray(track?.artists) ? track.artists : [];
    const album = track?.album || {};
    const id = track?.id || trackIdFromUri(track?.uri);
    const uri = track?.uri || (id ? "spotify:track:" + id : "");
    const release = album?.release_date || album?.date || null;
    return blank({
      uri,
      uid: "search:" + (id || uri || index) + ":" + index,
      id,
      name: track?.name || "Unknown",
      artists: artistsDisplay(artists),
      artistIds: artistIdsFromList(artists),
      album: album?.name || "",
      albumId: album?.id || null,
      albumUri: album?.uri || null,
      durationMs: track?.duration_ms ?? track?.duration?.milliseconds ?? 0,
      explicit: !!track?.explicit,
      year: yearFromRelease(release),
      bpm: null,
      key: null,
      addedAt: null,
    });
  }

  function artistNamesFromGraphql(data) {
    const raw = data?.artists;
    if (Array.isArray(raw?.items)) {
      return raw.items.map((a) => a?.profile?.name || a?.name).filter(Boolean);
    }
    if (Array.isArray(raw)) {
      return raw.map((a) => a?.profile?.name || a?.name || a).filter(Boolean);
    }
    if (data?.artist?.profile?.name) return [data.artist.profile.name];
    if (typeof data?.artistName === "string") return [data.artistName];
    return [];
  }

  function artistIdsFromGraphql(data) {
    const raw = data?.artists;
    const list = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
    return list.map((a) => a?.id || idFromSpotifyUri(a?.uri)).filter(Boolean);
  }

  /**
   * Pathfinder / searchV2 track entity.
   * @param {object} data
   * @param {number} index
   * @returns {MixAppTrackRow|null}
   */
  function fromGraphqlTrack(data, index) {
    if (!data) return null;
    const uri = data.uri || (data.id ? "spotify:track:" + data.id : "");
    if (!uri || !String(uri).includes(":track:")) return null;
    const id = data.id || trackIdFromUri(uri);
    const album = data.albumOfTrack || data.album || {};
    const durationMs =
      data.duration?.totalMilliseconds ??
      data.duration?.milliseconds ??
      data.trackDuration?.totalMilliseconds ??
      data.trackDuration?.milliseconds ??
      data.duration_ms ??
      data.durationMs ??
      0;
    const rating = data.contentRating?.label || data.contentRating || "";
    const explicit = !!data.explicit || String(rating).toUpperCase() === "EXPLICIT";
    const release =
      album?.date?.isoString || album?.date?.year || album?.release_date || null;
    return blank({
      uri,
      uid: "search:" + (id || uri) + ":" + index,
      id,
      name: data.name || data.title || "Unknown",
      artists: artistNamesFromGraphql(data).join(", "),
      artistIds: artistIdsFromGraphql(data),
      album: album?.name || "",
      albumId: album?.id || idFromSpotifyUri(album?.uri) || null,
      albumUri: album?.uri || null,
      durationMs,
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
   * @param {Partial<MixAppTrackRow>|null|undefined} track
   * @param {number} [stamp]
   * @returns {MixAppTrackRow}
   */
  function forAppend(track, stamp) {
    const ts = stamp == null ? Date.now() : stamp;
    const id = track?.id || trackIdFromUri(track?.uri);
    const core = blank({
      uri: track?.uri || "",
      uid: `added:${track?.uri}:${ts}`,
      id,
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
      if (track && track[k] != null) core[k] = track[k];
    }
    if (track?.keyNative) core.keyNative = true;
    if (track?.bpmNative) core.bpmNative = true;
    if (track?.keyColor) core.keyColor = track.keyColor;
    if (track?.standardKey) core.standardKey = track.standardKey;
    if (track?.standardMode) core.standardMode = track.standardMode;
    return core;
  }

  return {
    CORE_KEYS,
    FEATURE_KEYS,
    trackIdFromUri,
    blank,
    ensure,
    coerceSpotifyTrackKey,
    applyNativeAudioAttrs,
    fromPlaylistItem,
    fromWebApiTrack,
    fromGraphqlTrack,
    forAppend,
    /** @deprecated alias — prefer fromPlaylistItem */
    normalizeTrack: fromPlaylistItem,
    /** @deprecated alias — prefer fromWebApiTrack */
    normalizeCatalogTrack: fromWebApiTrack,
    /** @deprecated alias — prefer fromGraphqlTrack */
    normalizeGraphqlTrack: fromGraphqlTrack,
  };
})();
