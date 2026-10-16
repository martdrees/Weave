//@ts-check
/**
 * Recommendations via Song Radio (inspiredby-mix), then local post-filters
 * and optional feature-range filtering.
 */

const MixAppRecommend = (() => {
  const DEFAULT_LIMIT = 100;
  const MAX_LIMIT = 200;
  /** Max inspiredby-mix playlist resolutions (track/artist/album). */
  const MAX_RADIO_FETCHES = 40;
  /** Max related-artist / top-tracks API calls for padding. */
  const MAX_ARTIST_FETCHES = 25;

  function radioUrls(kind, id) {
    const k = kind || "track";
    return [
      "https://spclient.wg.spotify.com/inspiredby-mix/v2/seed_to_playlist/spotify:" +
        k +
        ":" +
        id +
        "?response-format=json",
      "https://api.spotify.com/v1/inspiredby-mix/v2/seed_to_playlist/spotify:" +
        k +
        ":" +
        id +
        "?response-format=json",
    ];
  }

  /** Features tunable via local filter after Song Radio fetch. */
  const FEATURE_DEFS = [
    { id: "acousticness", label: "Acousticness", min: 0, max: 1, step: 0.01, kind: "01" },
    { id: "danceability", label: "Danceability", min: 0, max: 1, step: 0.01, kind: "01" },
    { id: "energy", label: "Energy", min: 0, max: 1, step: 0.01, kind: "01" },
    { id: "instrumentalness", label: "Instrumentalness", min: 0, max: 1, step: 0.01, kind: "01" },
    { id: "liveness", label: "Liveness", min: 0, max: 1, step: 0.01, kind: "01" },
    { id: "speechiness", label: "Speechiness", min: 0, max: 1, step: 0.01, kind: "01" },
    { id: "valence", label: "Valence", min: 0, max: 1, step: 0.01, kind: "01" },
    { id: "tempo", label: "Tempo (BPM)", min: 40, max: 220, step: 1, kind: "tempo" },
    { id: "loudness", label: "Loudness (dB)", min: -60, max: 0, step: 0.5, kind: "loudness" },
    { id: "popularity", label: "Popularity", min: 0, max: 100, step: 1, kind: "popularity" },
  ];

  const ABERRANT_RE =
    /\b(sped\s*up|speed\s*up|slowed(\s*(\+|and|&)\s*reverb)?|nightcore|daycore|tiktok|8d\s*audio|dj\s*mix|continuous\s*mix|mega\s*mix|full\s*album\s*mix|hour\s*mix|minutes?\s*mix)\b/i;

  function trackIdFromUri(uri) {
    if (!uri || !String(uri).includes(":track:")) return null;
    return String(uri).split(":").pop() || null;
  }

  function defaultFeatureState() {
    const state = {};
    for (const def of FEATURE_DEFS) {
      state[def.id] = {
        enabled: false,
        min: def.min,
        max: def.max,
        useTarget: false,
        target: (def.min + def.max) / 2,
      };
    }
    return state;
  }

  function cloneFeatures(features) {
    const next = {};
    for (const [id, range] of Object.entries(features || {})) {
      next[id] = { ...range };
    }
    return next;
  }

  function anyFeatureEnabled(features) {
    return FEATURE_DEFS.some((d) => features?.[d.id]?.enabled);
  }

  function yearFromReleaseDate(dateStr) {
    if (!dateStr) return null;
    const y = parseInt(String(dateStr).slice(0, 4), 10);
    return Number.isFinite(y) ? y : null;
  }

  function isAberrantTitle(name) {
    if (!name) return false;
    return ABERRANT_RE.test(String(name));
  }

  function applyPostFilters(candidates, filters = {}) {
    const {
      yearMin = null,
      yearMax = null,
      excludeExplicit = false,
      excludeAberrant = true,
      excludeTrackIds = [],
      excludeArtistIds = [],
      hideExistingUris = [],
      bannedUris = [],
      seedTrackIds = [],
      includeSeedTracks = false,
    } = filters;

    const excludeTracks = new Set(
      [...excludeTrackIds, ...(seedTrackIds || [])].filter(Boolean)
    );
    if (includeSeedTracks) {
      for (const id of seedTrackIds || []) excludeTracks.delete(id);
    }
    const excludeArtists = new Set((excludeArtistIds || []).filter(Boolean));
    const hideUris = new Set([
      ...(hideExistingUris || []),
      ...(bannedUris || []),
    ]);

    return (candidates || []).filter((t) => {
      if (!t?.uri) return false;
      if (hideUris.has(t.uri)) return false;
      const id = t.id || trackIdFromUri(t.uri);
      if (id && excludeTracks.has(id)) return false;
      if (excludeExplicit && t.explicit) return false;
      if (excludeAberrant && isAberrantTitle(t.name)) return false;
      if (yearMin != null && t.year != null && t.year < yearMin) return false;
      if (yearMax != null && t.year != null && t.year > yearMax) return false;
      if (
        excludeArtists.size &&
        t.artistIds?.some((a) => excludeArtists.has(a))
      ) {
        return false;
      }
      return true;
    });
  }

  async function filterByLocalFeatures(tracks, features) {
    if (!anyFeatureEnabled(features) || !tracks?.length) return tracks;
    if (typeof MixAppFeatures?.getFeatureSampleMap !== "function") return tracks;

    const ids = tracks.map((t) => t.id || trackIdFromUri(t.uri)).filter(Boolean);
    const sampleMap = await MixAppFeatures.getFeatureSampleMap(ids);

    return tracks.filter((t) => {
      const id = t.id || trackIdFromUri(t.uri);
      const sample = id ? sampleMap.get(id) : null;
      if (!sample) return true; // keep if unknown
      for (const def of FEATURE_DEFS) {
        const range = features[def.id];
        if (!range?.enabled) continue;
        const v = sample[def.id];
        if (v == null || Number.isNaN(Number(v))) continue;
        const n = Number(v);
        if (range.min != null && n < Number(range.min)) return false;
        if (range.max != null && n > Number(range.max)) return false;
      }
      return true;
    });
  }

  async function resolveRadioPlaylistUri(kind, id) {
    for (const url of radioUrls(kind, id)) {
      try {
        const res = await Spicetify.CosmosAsync.get(url);
        const items = res?.mediaItems || res?.media_items || res?.items || [];
        const uri =
          (Array.isArray(items) && items[0]?.uri) ||
          res?.uri ||
          res?.playlist?.uri ||
          null;
        if (uri && String(uri).includes(":playlist:")) return uri;
        if (uri && String(uri).includes("playlist")) return uri;
      } catch (err) {
        console.warn("MixApp: radio seed failed", kind, id, err);
      }
    }
    return null;
  }

  function albumIdFromTrack(t) {
    const uri = t?.albumUri || t?.album?.uri;
    if (uri && String(uri).includes(":album:")) {
      return String(uri).split(":").pop();
    }
    return t?.albumId || null;
  }

  function ingestTrack(byUri, t, prefix) {
    if (!t?.uri || byUri.has(t.uri)) return false;
    const tid = t.id || trackIdFromUri(t.uri);
    byUri.set(t.uri, {
      ...t,
      id: tid,
      uid: (prefix || "rec:") + (tid || t.uri) + ":" + byUri.size,
      year:
        t.year ?? yearFromReleaseDate(t.releaseDate || t.albumReleaseDate),
    });
    return true;
  }

  function normalizeWebTrack(raw, index) {
    const track = raw?.track || raw;
    const artists = Array.isArray(track?.artists) ? track.artists : [];
    const album = track?.album || {};
    const id = track?.id || trackIdFromUri(track?.uri);
    const uri = track?.uri || (id ? "spotify:track:" + id : "");
    return {
      uri,
      uid: "web:" + (id || uri || index) + ":" + index,
      id,
      name: track?.name || "Unknown",
      artists: artists.map((a) => a?.name || a).filter(Boolean).join(", "),
      artistIds: artists
        .map((a) => a?.id || (a?.uri ? String(a.uri).split(":").pop() : null))
        .filter(Boolean),
      album: album?.name || "",
      albumId: album?.id || null,
      albumUri: album?.uri || null,
      durationMs: track?.duration_ms ?? 0,
      explicit: !!track?.explicit,
      popularity: track?.popularity ?? null,
      year: yearFromReleaseDate(album?.release_date),
      bpm: null,
      key: null,
      addedAt: null,
    };
  }

  async function getUserMarket() {
    try {
      const me = await Spicetify.CosmosAsync.get(
        "https://api.spotify.com/v1/me"
      );
      if (me?.country) return me.country;
    } catch (_) {
      /* ignore */
    }
    return "US";
  }

  async function fetchArtistTopTracks(artistId, market) {
    try {
      const res = await Spicetify.CosmosAsync.get(
        "https://api.spotify.com/v1/artists/" +
          artistId +
          "/top-tracks?market=" +
          encodeURIComponent(market || "US")
      );
      return (res?.tracks || []).map((t, i) => normalizeWebTrack(t, i));
    } catch (err) {
      console.warn("MixApp: artist top-tracks failed", artistId, err);
      return [];
    }
  }

  async function fetchRelatedArtistIds(artistId) {
    try {
      const res = await Spicetify.CosmosAsync.get(
        "https://api.spotify.com/v1/artists/" + artistId + "/related-artists"
      );
      return (res?.artists || [])
        .map((a) => a?.id)
        .filter(Boolean)
        .slice(0, 12);
    } catch (err) {
      console.warn("MixApp: related-artists failed", artistId, err);
      return [];
    }
  }

  /**
   * Collect candidates until rawTarget. Song Radio lists are ~50 tracks and
   * often resolve to the same playlist for similar seeds — so we skip duplicate
   * playlist URIs and also expand via artist/album radio + top tracks.
   */
  async function collectCandidates({ seedTrackIds, seedTracks, rawTarget }) {
    const byUri = new Map();
    const usedSeeds = new Set();
    const usedPlaylists = new Set();
    const queue = [];
    let radios = 0;
    let artistFetches = 0;
    let market = null;

    function enqueue(kind, id) {
      if (!id) return;
      const key = kind + ":" + id;
      if (usedSeeds.has(key)) return;
      queue.push({ kind, id, key });
    }

    for (const id of seedTrackIds || []) enqueue("track", id);

    // Seed artist / album radios from the playlist rows when available.
    for (const t of seedTracks || []) {
      for (const aid of t.artistIds || []) enqueue("artist", aid);
      const albumId = albumIdFromTrack(t);
      if (albumId) enqueue("album", albumId);
    }

    async function ensureMarket() {
      if (!market) market = await getUserMarket();
      return market;
    }

    async function loadRadio(kind, id) {
      const playlistUri = await resolveRadioPlaylistUri(kind, id);
      if (!playlistUri) return 0;
      if (usedPlaylists.has(playlistUri)) return 0;
      usedPlaylists.add(playlistUri);
      radios += 1;
      let added = 0;
      try {
        const items = await MixAppApi.getPlaylistTracks(playlistUri);
        for (let i = 0; i < items.length; i++) {
          const t = items[i];
          if (!ingestTrack(byUri, t, "radio:")) continue;
          added += 1;
          const tid = t.id || trackIdFromUri(t.uri);
          // Sparse track expansion — prefer artists/albums for diversity.
          if (tid && added % 4 === 0) enqueue("track", tid);
          for (const aid of t.artistIds || []) enqueue("artist", aid);
          const albumId = albumIdFromTrack(t);
          if (albumId) enqueue("album", albumId);
          if (byUri.size >= rawTarget) break;
        }
      } catch (err) {
        console.warn("MixApp: failed to load radio playlist", playlistUri, err);
      }
      return added;
    }

    async function loadArtistPad(artistId) {
      if (artistFetches >= MAX_ARTIST_FETCHES) return 0;
      artistFetches += 1;
      const m = await ensureMarket();
      const tops = await fetchArtistTopTracks(artistId, m);
      let added = 0;
      for (const t of tops) {
        if (ingestTrack(byUri, t, "top:")) added += 1;
        if (byUri.size >= rawTarget) break;
      }
      if (byUri.size < rawTarget && artistFetches < MAX_ARTIST_FETCHES) {
        const related = await fetchRelatedArtistIds(artistId);
        for (const rid of related) enqueue("artist", rid);
      }
      return added;
    }

    let steps = 0;
    const maxSteps = 120;
    while (queue.length > 0 && byUri.size < rawTarget && steps < maxSteps) {
      steps += 1;
      const next = queue.shift();
      if (!next || usedSeeds.has(next.key)) continue;
      usedSeeds.add(next.key);

      if (next.kind === "track" || next.kind === "album") {
        if (radios >= MAX_RADIO_FETCHES) continue;
        await loadRadio(next.kind, next.id);
      } else if (next.kind === "artist") {
        // Artist radio + top tracks (top tracks help when radio playlists collide).
        if (radios < MAX_RADIO_FETCHES) {
          await loadRadio("artist", next.id);
        }
        if (byUri.size < rawTarget) {
          await loadArtistPad(next.id);
        }
      }
    }

    return {
      tracks: [...byUri.values()],
      radios,
      rawTotal: byUri.size,
      playlistsUsed: usedPlaylists.size,
    };
  }

  async function recommend(opts = {}) {
    const seedTrackIds = [...new Set((opts.seedTrackIds || []).filter(Boolean))];
    if (!seedTrackIds.length) {
      throw new Error("Select at least one seed track");
    }

    const target = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(opts.limit) || DEFAULT_LIMIT)
    );
    const filters = {
      ...(opts.filters || {}),
      seedTrackIds,
    };
    const features = cloneFeatures(opts.features || defaultFeatureState());

    // Over-fetch so post-filters can still leave up to `target` rows.
    const rawTarget = Math.min(
      MAX_LIMIT,
      Math.max(target + 20, Math.ceil(target * 1.8))
    );

    const { tracks, radios, rawTotal, playlistsUsed } = await collectCandidates({
      seedTrackIds,
      seedTracks: opts.seedTracks || [],
      rawTarget,
    });

    if (!rawTotal) {
      throw new Error(
        "Song Radio returned no playlists for the selected seeds"
      );
    }

    let pool = applyPostFilters(tracks, filters);
    pool = await filterByLocalFeatures(pool, features);

    return {
      tracks: pool.slice(0, target),
      featuresUsed: features,
      engine: "song-radio",
      radioCount: radios,
      playlistsUsed,
      rawTotal,
    };
  }

  function featuresFromSamples(samples) {
    const state = defaultFeatureState();
    if (!samples?.length) return state;

    for (const def of FEATURE_DEFS) {
      const values = samples
        .map((s) => s?.[def.id])
        .filter((v) => v != null && !Number.isNaN(Number(v)))
        .map(Number);
      if (!values.length) continue;
      const minV = Math.min(...values);
      const maxV = Math.max(...values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      let pad;
      if (def.kind === "01") pad = 0.08;
      else if (def.kind === "tempo") pad = 12;
      else if (def.kind === "loudness") pad = 4;
      else if (def.kind === "popularity") pad = 10;
      else pad = 0.08;
      state[def.id] = {
        enabled: true,
        min: Math.max(def.min, minV - pad),
        max: Math.min(def.max, maxV + pad),
        useTarget: true,
        target: Math.min(def.max, Math.max(def.min, avg)),
      };
    }
    return state;
  }

  return {
    FEATURE_DEFS,
    DEFAULT_LIMIT,
    MAX_LIMIT,
    defaultFeatureState,
    recommend,
    applyPostFilters,
    isAberrantTitle,
    trackIdFromUri,
    featuresFromSamples,
  };
})();
