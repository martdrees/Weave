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
    {
      id: "acousticness",
      label: "Acousticness",
      min: 0,
      max: 1,
      step: 0.01,
      kind: "01",
    },
    {
      id: "danceability",
      label: "Danceability",
      min: 0,
      max: 1,
      step: 0.01,
      kind: "01",
    },
    { id: "energy", label: "Energy", min: 0, max: 1, step: 0.01, kind: "01" },
    {
      id: "instrumentalness",
      label: "Instrumentalness",
      min: 0,
      max: 1,
      step: 0.01,
      kind: "01",
    },
    { id: "liveness", label: "Liveness", min: 0, max: 1, step: 0.01, kind: "01" },
    { id: "speechiness", label: "Speechiness", min: 0, max: 1, step: 0.01, kind: "01" },
    { id: "valence", label: "Valence", min: 0, max: 1, step: 0.01, kind: "01" },
    { id: "tempo", label: "Tempo (BPM)", min: 40, max: 220, step: 1, kind: "tempo" },
    {
      id: "loudness",
      label: "Loudness (dB)",
      min: -60,
      max: 0,
      step: 0.5,
      kind: "loudness",
    },
    {
      id: "popularity",
      label: "Popularity",
      min: 0,
      max: 100,
      step: 1,
      kind: "popularity",
    },
  ];

  const ABERRANT_RE =
    /\b(sped\s*up|speed\s*up|slowed(\s*(\+|and|&)\s*reverb)?|nightcore|daycore|tiktok|8d\s*audio|dj\s*mix|continuous\s*mix|mega\s*mix|full\s*album\s*mix|hour\s*mix|minutes?\s*mix)\b/i;

  function trackIdFromUri(uri) {
    if (!uri || !String(uri).includes(":track:")) return null;
    return String(uri).split(":").pop() || null;
  }

  function shuffleInPlace(arr) {
    const a = arr;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function sampleRandom(arr, n) {
    if (!arr?.length || n <= 0) return [];
    if (arr.length <= n) return shuffleInPlace(arr.slice());
    return shuffleInPlace(arr.slice()).slice(0, n);
  }

  /**
   * Prefer tracks not in avoidUris when the pool is large enough; always
   * random-sample so repeated searches don't return the same head slice.
   */
  function sampleResults(pool, target, avoidUris) {
    if (!pool?.length) return [];
    if (pool.length <= target) return shuffleInPlace(pool.slice());

    const avoid = new Set((avoidUris || []).filter(Boolean));
    if (avoid.size) {
      const fresh = pool.filter((t) => t?.uri && !avoid.has(t.uri));
      // Need a decent fresh set; otherwise fall back to full pool.
      if (fresh.length >= Math.max(8, Math.ceil(target * 0.6))) {
        if (fresh.length >= target) return sampleRandom(fresh, target);
        const rest = pool.filter((t) => !t?.uri || avoid.has(t.uri));
        return sampleRandom(fresh, fresh.length).concat(
          sampleRandom(rest, target - fresh.length)
        );
      }
    }
    return sampleRandom(pool, target);
  }

  /** Normalize to spotify:track:{id} so playlist vs radio URIs compare equal. */
  function canonicalTrackUri(uri) {
    const id = trackIdFromUri(uri);
    if (id) return "spotify:track:" + id;
    return uri ? String(uri) : null;
  }

  function normalizeFingerprintPart(s) {
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
   * name + primary artist, stripped of feat./parentheses noise.
   */
  function trackFingerprint(t) {
    if (!t) return null;
    const name = normalizeFingerprintPart(t.name);
    const artistStr =
      typeof t.artists === "string"
        ? t.artists
        : Array.isArray(t.artists)
          ? t.artists
              .map((a) => a?.name || a)
              .filter(Boolean)
              .join(", ")
          : "";
    const primary = normalizeFingerprintPart(String(artistStr).split(",")[0] || "");
    if (!name || !primary) return null;
    return name + "|" + primary;
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
      hideExistingTracks = [],
      bannedUris = [],
      seedTrackIds = [],
      includeSeedTracks = false,
    } = filters;

    const excludeTracks = new Set(
      [...excludeTrackIds, ...(seedTrackIds || [])]
        .map((id) => (id != null ? String(id) : null))
        .filter(Boolean)
    );
    if (includeSeedTracks) {
      for (const id of seedTrackIds || []) excludeTracks.delete(String(id));
    }
    const excludeArtists = new Set(
      (excludeArtistIds || []).map((id) => String(id)).filter(Boolean)
    );

    const hideUris = new Set();
    const hideIds = new Set(excludeTracks);
    const hideFingerprints = new Set();

    function absorbExistingTrack(t) {
      if (!t) return;
      if (typeof t === "string") {
        const uri = canonicalTrackUri(t);
        if (uri) hideUris.add(uri);
        const id = trackIdFromUri(t);
        if (id) hideIds.add(id);
        return;
      }
      const uri = canonicalTrackUri(t.uri);
      if (uri) hideUris.add(uri);
      const id = t.id || trackIdFromUri(t.uri);
      if (id) hideIds.add(String(id));
      const fp = trackFingerprint(t);
      if (fp) hideFingerprints.add(fp);
    }

    for (const raw of [...(hideExistingUris || []), ...(bannedUris || [])]) {
      absorbExistingTrack(raw);
    }
    for (const t of hideExistingTracks || []) {
      absorbExistingTrack(t);
    }

    return (candidates || []).filter((t) => {
      if (!t?.uri && !t?.name) return false;
      const uri = canonicalTrackUri(t.uri);
      const id = t.id || trackIdFromUri(t.uri);
      const fp = trackFingerprint(t);
      if (uri && hideUris.has(uri)) return false;
      if (id && hideIds.has(String(id))) return false;
      if (fp && hideFingerprints.has(fp)) return false;
      if (excludeExplicit && t.explicit) return false;
      if (excludeAberrant && isAberrantTitle(t.name)) return false;
      // Year unknown → drop when a year bound is set (don't let nulls bypass the filter)
      if (yearMin != null || yearMax != null) {
        if (t.year == null) return false;
        if (yearMin != null && t.year < yearMin) return false;
        if (yearMax != null && t.year > yearMax) return false;
      }
      if (excludeArtists.size) {
        const aids = (t.artistIds || []).map((a) => String(a)).filter(Boolean);
        // No artist ids → can't verify; drop when hiding existing artists
        if (!aids.length) return false;
        if (aids.some((a) => excludeArtists.has(a))) return false;
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

  async function cosmosGetRetry(url, label) {
    const getter = MixAppApi?.withRetry;
    if (getter) {
      return getter(() => Spicetify.CosmosAsync.get(url), {
        retries: 4,
        label: label || "recommend",
        notifyUser: true,
      });
    }
    return Spicetify.CosmosAsync.get(url);
  }

  async function resolveRadioPlaylistUri(kind, id) {
    for (const url of radioUrls(kind, id)) {
      try {
        const res = await cosmosGetRetry(url, "song-radio");
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
      year: t.year ?? yearFromReleaseDate(t.releaseDate || t.albumReleaseDate),
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
      artists: artists
        .map((a) => a?.name || a)
        .filter(Boolean)
        .join(", "),
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
      const me = await cosmosGetRetry("https://api.spotify.com/v1/me", "profile");
      if (me?.country) return me.country;
    } catch (_) {
      /* ignore */
    }
    return "US";
  }

  async function fetchArtistTopTracks(artistId, market) {
    try {
      const res = await cosmosGetRetry(
        "https://api.spotify.com/v1/artists/" +
          artistId +
          "/top-tracks?market=" +
          encodeURIComponent(market || "US"),
        "artist-top-tracks"
      );
      return (res?.tracks || []).map((t, i) => normalizeWebTrack(t, i));
    } catch (err) {
      console.warn("MixApp: artist top-tracks failed", artistId, err);
      return [];
    }
  }

  async function fetchRelatedArtistIds(artistId) {
    try {
      const res = await cosmosGetRetry(
        "https://api.spotify.com/v1/artists/" + artistId + "/related-artists",
        "related-artists"
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
      // Skip if already waiting in queue.
      if (queue.some((q) => q.key === key)) return;
      queue.push({ kind, id, key });
    }

    // Random seed order → different radios get fetched before rawTarget fills.
    for (const id of shuffleInPlace([...(seedTrackIds || [])])) {
      enqueue("track", id);
    }

    // Seed artist / album radios from the playlist rows when available.
    for (const t of shuffleInPlace([...(seedTracks || [])])) {
      for (const aid of shuffleInPlace([...(t.artistIds || [])])) {
        enqueue("artist", aid);
      }
      const albumId = albumIdFromTrack(t);
      if (albumId) enqueue("album", albumId);
    }
    shuffleInPlace(queue);

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
        const items = shuffleInPlace(
          (await MixAppApi.getPlaylistTracks(playlistUri)).slice()
        );
        for (let i = 0; i < items.length; i++) {
          const t = items[i];
          // Random skips diversify which radio rows enter the pool.
          if (Math.random() < 0.2) continue;
          if (!ingestTrack(byUri, t, "radio:")) continue;
          added += 1;
          const tid = t.id || trackIdFromUri(t.uri);
          // Sparse, random expansion — explore different graph branches per run.
          if (tid && Math.random() < 0.28) enqueue("track", tid);
          for (const aid of t.artistIds || []) {
            if (Math.random() < 0.45) enqueue("artist", aid);
          }
          const albumId = albumIdFromTrack(t);
          if (albumId && Math.random() < 0.35) enqueue("album", albumId);
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
      const tops = shuffleInPlace((await fetchArtistTopTracks(artistId, m)).slice());
      let added = 0;
      for (const t of tops) {
        if (Math.random() < 0.15) continue;
        if (ingestTrack(byUri, t, "top:")) added += 1;
        if (byUri.size >= rawTarget) break;
      }
      if (byUri.size < rawTarget && artistFetches < MAX_ARTIST_FETCHES) {
        const related = shuffleInPlace((await fetchRelatedArtistIds(artistId)).slice());
        for (const rid of related) {
          if (Math.random() < 0.7) enqueue("artist", rid);
        }
      }
      return added;
    }

    let steps = 0;
    const maxSteps = 120;
    while (queue.length > 0 && byUri.size < rawTarget && steps < maxSteps) {
      steps += 1;
      // Pop a random queued seed so exploration order differs each search.
      const idx = Math.floor(Math.random() * queue.length);
      const next = queue.splice(idx, 1)[0];
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

  /**
   * Pick a diverse subset of playlist tracks as soft seeds when the user
   * didn't mark any (MixMoose allows feature/filter search without seeds).
   * Randomized each call so seedless search explores different radios.
   */
  function pickSoftSeeds(tracks, limit = 8) {
    const list = shuffleInPlace(
      (tracks || []).filter((t) => t?.uri && (t.id || trackIdFromUri(t.uri)))
    );
    const picked = [];
    const seenArtist = new Set();
    for (const t of list) {
      const aid = t.artistIds?.[0] || "";
      if (aid && seenArtist.has(aid)) continue;
      if (aid) seenArtist.add(aid);
      picked.push(t);
      if (picked.length >= limit) break;
    }
    for (const t of list) {
      if (picked.length >= limit) break;
      if (!picked.includes(t)) picked.push(t);
    }
    return {
      ids: picked.map((t) => t.id || trackIdFromUri(t.uri)).filter(Boolean),
      tracks: picked,
    };
  }

  /**
   * Song Radio candidates → local filters → sampled results.
   * @param {object} [opts]
   * @param {string[]} [opts.seedTrackIds]
   * @param {MixAppTrackRow[]} [opts.seedTracks]
   * @param {MixAppTrackRow[]} [opts.contextTracks]
   * @param {number} [opts.limit]
   * @param {object} [opts.filters]
   * @param {object} [opts.features]
   * @param {string[]} [opts.avoidUris]
   * @returns {Promise<MixAppRecommendResult>}
   */
  async function recommend(opts = {}) {
    let seedTrackIds = [...new Set((opts.seedTrackIds || []).filter(Boolean))];
    let seedTracks = Array.isArray(opts.seedTracks) ? opts.seedTracks.slice() : [];
    const contextTracks = Array.isArray(opts.contextTracks) ? opts.contextTracks : [];
    const usedSoftSeeds = !seedTrackIds.length;

    if (!seedTrackIds.length) {
      const soft = pickSoftSeeds(contextTracks, 8);
      seedTrackIds = soft.ids;
      seedTracks = soft.tracks.length ? soft.tracks : contextTracks.slice(0, 12);
    }

    if (!seedTrackIds.length && !(seedTracks || []).some((t) => t?.artistIds?.length)) {
      throw new Error("Mark seed tracks or load a playlist with tracks to search");
    }

    const target = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(opts.limit) || DEFAULT_LIMIT)
    );
    const filters = {
      ...(opts.filters || {}),
      // Soft seeds are only for discovery — don't exclude them as "seed tracks"
      // unless the user explicitly marked them.
      seedTrackIds: usedSoftSeeds ? [] : seedTrackIds,
    };

    // Soft-seed / playlist-context search: Song Radio often echoes the playlist
    // (sometimes under different track IDs). Exclude by URI, id, and fingerprint.
    const hidingExisting =
      (filters.hideExistingUris || []).length > 0 ||
      (filters.hideExistingTracks || []).length > 0 ||
      (filters.excludeTrackIds || []).length > 0;
    if (hidingExisting && contextTracks.length) {
      const ctxUris = contextTracks.map((t) => t.uri).filter(Boolean);
      const ctxIds = contextTracks
        .map((t) => t.id || trackIdFromUri(t.uri))
        .filter(Boolean);
      filters.hideExistingUris = [
        ...new Set([...(filters.hideExistingUris || []), ...ctxUris]),
      ];
      filters.excludeTrackIds = [
        ...new Set([...(filters.excludeTrackIds || []), ...ctxIds]),
      ];
      filters.hideExistingTracks = [
        ...(filters.hideExistingTracks || []),
        ...contextTracks,
      ];
    }

    const features = cloneFeatures(opts.features || defaultFeatureState());

    // Over-fetch so post-filters can still leave up to `target` rows.
    // Soft-seed + hide-existing drops a large share of radio echoes — fetch more.
    const overFetch = usedSoftSeeds && hidingExisting ? 3.2 : 1.8;
    const rawTarget = Math.min(
      MAX_LIMIT,
      Math.max(target + 40, Math.ceil(target * overFetch))
    );

    const { tracks, radios, rawTotal, playlistsUsed } = await collectCandidates({
      seedTrackIds,
      seedTracks,
      rawTarget,
    });

    if (!rawTotal) {
      throw new Error(
        usedSoftSeeds
          ? "No candidates from this playlist — try marking seed tracks"
          : "Song Radio returned no playlists for the selected seeds"
      );
    }

    let pool = applyPostFilters(tracks, filters);
    pool = await filterByLocalFeatures(pool, features);
    pool = sampleResults(pool, target, opts.avoidUris || []);

    return {
      tracks: pool,
      featuresUsed: features,
      engine: "song-radio",
      radioCount: radios,
      playlistsUsed,
      rawTotal,
      usedSoftSeeds,
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
    sampleResults,
    isAberrantTitle,
    trackIdFromUri,
    trackFingerprint,
    featuresFromSamples,
  };
})();
