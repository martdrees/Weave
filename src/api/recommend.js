//@ts-check
/**
 * Recommendations via Song Radio (inspiredby-mix), then local post-filters
 * and optional feature-range filtering.
 */

const MixAppRecommend = (() => {
  const DEFAULT_LIMIT = 100;
  const MAX_LIMIT = 200;
  /** Max inspiredby-mix playlist resolutions (track/artist/album). */
  const MAX_RADIO_FETCHES = 12;
  /** Max related-artist / top-tracks API calls for padding (last resort). */
  const MAX_ARTIST_FETCHES = 6;

  function radioUrls(kind, id) {
    const k = kind || "track";
    // spclient only — the api.spotify.com twin burns the shared Web API budget.
    return [
      "https://spclient.wg.spotify.com/inspiredby-mix/v2/seed_to_playlist/spotify:" +
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

  /** Padding around a center value when snapping min/max to an average. */
  function featurePad(def) {
    if (def.kind === "01") return 0.08;
    if (def.kind === "tempo") return 12;
    if (def.kind === "loudness") return 4;
    if (def.kind === "popularity") return 10;
    return 0.08;
  }

  /** Hard band centered on `center`, clamped to the feature domain. */
  function rangeAroundValue(def, center) {
    const pad = featurePad(def);
    const c = Math.min(def.max, Math.max(def.min, Number(center)));
    if (!Number.isFinite(c)) {
      return { min: def.min, max: def.max };
    }
    return {
      min: Math.max(def.min, c - pad),
      max: Math.min(def.max, c + pad),
    };
  }

  function defaultFeatureState() {
    const state = {};
    for (const def of FEATURE_DEFS) {
      state[def.id] = {
        enabled: false,
        aroundAvg: false,
        min: def.min,
        max: def.max,
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
    // Prefer queued MixAppHttp (assert + spacing). Keep retries low — padding
    // calls must not burn the global Web API budget before create/save.
    if (MixAppHttp?.cosmosGet) {
      return MixAppHttp.cosmosGet(url, {
        retries: 2,
        label: label || "recommend",
        notifyUser: false,
        failFastOnCooldown: true,
      });
    }
    return Spicetify.CosmosAsync.get(url);
  }

  let cachedMarket = null;
  let rateLimitedPad = false;
  /** Stops further radio / pad fetches for this search after a 429. */
  let networkLimited = false;
  let loggedNetworkLimit = false;

  function noteNetworkLimit() {
    networkLimited = true;
    rateLimitedPad = true;
    MixAppHttp?.markRateLimited?.(4000);
    if (!loggedNetworkLimit) {
      loggedNetworkLimit = true;
      console.warn(
        "Weave: recommendations rate-limited — stopping further seed fetches"
      );
    }
  }

  function networkBlocked() {
    if (networkLimited) return true;
    if (MixAppHttp?.isCoolingDown?.()) {
      noteNetworkLimit();
      return true;
    }
    return false;
  }

  async function resolveRadioPlaylistUri(kind, id) {
    if (networkBlocked()) return null;
    for (const url of radioUrls(kind, id)) {
      if (networkBlocked()) return null;
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
        if (MixAppHttp?.isRateLimitError?.(err)) {
          noteNetworkLimit();
          return null;
        }
        // Soft miss (empty/404) — try the alternate endpoint quietly.
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
    if (cachedMarket) return cachedMarket;
    try {
      const me = await MixAppHttp.getMeProfile();
      cachedMarket = me?.country || "US";
      if (me?.source === "fallback" && MixAppHttp.isCoolingDown?.()) {
        noteNetworkLimit();
      }
    } catch (err) {
      if (MixAppHttp?.isRateLimitError?.(err)) noteNetworkLimit();
      cachedMarket = "US";
    }
    return cachedMarket;
  }

  function paddingBlocked() {
    return networkBlocked() || rateLimitedPad;
  }

  async function fetchArtistTopTracks(artistId, market) {
    if (paddingBlocked()) return [];
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
      if (MixAppHttp?.isRateLimitError?.(err)) {
        noteNetworkLimit();
      } else {
        console.warn("Weave: artist top-tracks failed", artistId, err);
      }
      return [];
    }
  }

  async function fetchRelatedArtistIds(artistId) {
    if (paddingBlocked()) return [];
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
      if (MixAppHttp?.isRateLimitError?.(err)) {
        noteNetworkLimit();
      } else {
        console.warn("Weave: related-artists failed", artistId, err);
      }
      return [];
    }
  }

  /**
   * Fill missing Camelot labels via AudioAttributesV2 (Platform metadata —
   * not the rate-limited Web API). Needed before Mix in Key can count matches.
   */
  async function ensureCamelotKeys(tracks) {
    if (!MixAppFeatures?.fetchAudioAttributesV2Map || !MixAppFeatures?.parseCamelot) {
      return;
    }
    const need = [];
    for (const t of tracks || []) {
      if (!t?.uri) continue;
      if (MixAppFeatures.parseCamelot(t)) continue;
      need.push(t);
    }
    if (!need.length) return;
    try {
      const map = await MixAppFeatures.fetchAudioAttributesV2Map(
        need.map((t) => t.uri)
      );
      for (const t of need) {
        const parsed = map.get(t.uri);
        if (!parsed?.keyInfo) continue;
        MixAppTrack.applyNativeAudioAttrs(t, parsed.keyInfo, parsed.bpm);
      }
    } catch (err) {
      console.warn("Weave: camelot key enrich failed", err);
    }
  }

  /**
   * Collect candidates until rawTarget (or camelot matchTarget).
   * Prefers seed track → album → artist radios; expands sparingly so one seed
   * does not stampede inspiredby-mix / Web API.
   */
  async function collectCandidates({
    seedTrackIds,
    seedTracks,
    rawTarget,
    camelotMoves = [],
    camelotSeeds = [],
    matchTarget = null,
    progressFilters = null,
  }) {
    const byUri = new Map();
    const usedSeeds = new Set();
    const usedPlaylists = new Set();
    const queue = [];
    let radios = 0;
    let artistFetches = 0;
    let market = null;
    let waitedForCooldown = false;
    rateLimitedPad = false;
    networkLimited = false;
    loggedNetworkLimit = false;

    const wantCamelot = Array.isArray(camelotMoves) && camelotMoves.length > 0;
    const camelotGoal =
      wantCamelot && matchTarget != null
        ? Math.max(1, Number(matchTarget) || 1)
        : null;
    // Camelot + hide-existing needs more radios — many in-key hits are already
    // in the playlist and get dropped after collection.
    const maxRadios = wantCamelot
      ? Math.max(MAX_RADIO_FETCHES, 24)
      : MAX_RADIO_FETCHES;
    const maxSteps = wantCamelot ? 60 : 40;

    function enqueue(kind, id) {
      if (!id) return;
      const key = kind + ":" + id;
      if (usedSeeds.has(key)) return;
      if (queue.some((q) => q.key === key)) return;
      queue.push({ kind, id, key });
    }

    function popNext() {
      if (!queue.length) return null;
      // Prefer track radios (best Song Radio signal), then album, then artist.
      for (const kind of ["track", "album", "artist"]) {
        const idx = queue.findIndex((q) => q.kind === kind);
        if (idx >= 0) return queue.splice(idx, 1)[0];
      }
      return queue.shift();
    }

    /** Matches that would survive hide-existing / bans (not raw radio echoes). */
    function usablePool() {
      let list = [...byUri.values()];
      if (progressFilters) list = applyPostFilters(list, progressFilters);
      return list;
    }

    function camelotMatchCount() {
      if (!camelotGoal || typeof MixAppFeatures?.filterTracksByCamelotMoves !== "function") {
        return usablePool().length;
      }
      return MixAppFeatures.filterTracksByCamelotMoves(
        usablePool(),
        camelotSeeds.length ? camelotSeeds : seedTracks,
        camelotMoves
      ).length;
    }

    function collectionDone() {
      if (camelotGoal != null) return camelotMatchCount() >= camelotGoal;
      return byUri.size >= rawTarget;
    }

    /** Expand graph only while the pool is still thin. */
    function shouldExpand() {
      if (collectionDone()) return false;
      if (wantCamelot) return camelotMatchCount() < camelotGoal;
      return byUri.size < Math.ceil(rawTarget * 0.45);
    }

    async function waitOutCooldownOnce() {
      if (waitedForCooldown) return false;
      if (!MixAppHttp?.isCoolingDown?.()) return false;
      waitedForCooldown = true;
      const ms = Math.min(
        Math.max(MixAppHttp.coolDownRemainingMs?.() || 3000, 1500),
        8000
      );
      console.warn(
        "Weave: waiting " + Math.ceil(ms / 1000) + "s for Spotify rate limit…"
      );
      await MixAppHttp.sleep(ms + 250);
      networkLimited = false;
      rateLimitedPad = false;
      return true;
    }

    // Seed track radios first (stable order), then artists / albums.
    for (const id of seedTrackIds || []) enqueue("track", id);
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
      if (networkBlocked()) return 0;
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
        const expand = shouldExpand();
        const freshlyAdded = [];
        for (let i = 0; i < items.length; i++) {
          const t = items[i];
          if (!ingestTrack(byUri, t, "radio:")) continue;
          added += 1;
          freshlyAdded.push(byUri.get(t.uri) || t);
          if (expand) {
            const tid = t.id || trackIdFromUri(t.uri);
            // Sparse expansion — far less aggressive than before.
            if (tid && Math.random() < 0.12) enqueue("track", tid);
            for (const aid of t.artistIds || []) {
              if (Math.random() < 0.18) enqueue("artist", aid);
            }
            const albumId = albumIdFromTrack(t);
            if (albumId && Math.random() < 0.12) enqueue("album", albumId);
          }
        }
        // Keys before Mix in Key progress check — otherwise we stop on
        // keyless rows or count playlist echoes that hide-existing will drop.
        if (wantCamelot && freshlyAdded.length) {
          await ensureCamelotKeys(freshlyAdded);
        }
      } catch (err) {
        if (MixAppHttp?.isRateLimitError?.(err)) {
          noteNetworkLimit();
        } else {
          console.warn("Weave: failed to load radio playlist", playlistUri, err);
        }
      }
      return added;
    }

    async function loadArtistPad(artistId) {
      if (artistFetches >= MAX_ARTIST_FETCHES) return 0;
      artistFetches += 1;
      const m = await ensureMarket();
      const tops = shuffleInPlace((await fetchArtistTopTracks(artistId, m)).slice());
      const freshlyAdded = [];
      let added = 0;
      for (const t of tops) {
        if (!ingestTrack(byUri, t, "top:")) continue;
        added += 1;
        freshlyAdded.push(byUri.get(t.uri) || t);
        if (collectionDone()) break;
      }
      if (wantCamelot && freshlyAdded.length) {
        await ensureCamelotKeys(freshlyAdded);
      }
      return added;
    }

    let steps = 0;
    while (queue.length > 0 && !collectionDone() && steps < maxSteps) {
      if (networkBlocked()) {
        const resumed = await waitOutCooldownOnce();
        if (!resumed || networkBlocked()) break;
      }
      steps += 1;
      const next = popNext();
      if (!next || usedSeeds.has(next.key)) continue;
      usedSeeds.add(next.key);

      if (next.kind === "track" || next.kind === "album") {
        if (radios >= maxRadios) continue;
        await loadRadio(next.kind, next.id);
      } else if (next.kind === "artist") {
        if (radios < maxRadios) {
          await loadRadio("artist", next.id);
        }
        // Web API top-tracks only if radios left the pool tiny.
        if (
          usablePool().length < 25 &&
          !collectionDone() &&
          !paddingBlocked() &&
          radios >= Math.min(2, maxRadios)
        ) {
          await loadArtistPad(next.id);
        }
      }
    }

    return {
      tracks: [...byUri.values()],
      radios,
      rawTotal: byUri.size,
      playlistsUsed: usedPlaylists.size,
      rateLimited: networkLimited || rateLimitedPad,
      camelotMatched: wantCamelot ? camelotMatchCount() : null,
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

    const camelotMoves = Array.isArray(opts.camelotMoves)
      ? opts.camelotMoves.filter(Boolean)
      : [];
    const camelotSeeds = Array.isArray(opts.camelotSeeds)
      ? opts.camelotSeeds
      : seedTracks;
    const matchTarget =
      opts.matchTarget != null ? Number(opts.matchTarget) : target;

    // Over-fetch so post-filters can still leave up to `target` rows.
    // Camelot + hide-existing: collect plenty; early-stop counts only usable hits.
    const overFetch = camelotMoves.length
      ? hidingExisting
        ? 3.0
        : 2.2
      : usedSoftSeeds && hidingExisting
        ? 2.4
        : 1.6;
    const rawTarget = Math.min(
      MAX_LIMIT,
      Math.max(target + 24, Math.ceil(target * overFetch))
    );

    // Same exclusions used for Mix in Key progress — don't stop early on
    // in-key tracks that hide-existing will throw away.
    const progressFilters = {
      hideExistingUris: filters.hideExistingUris || [],
      hideExistingTracks: filters.hideExistingTracks || [],
      bannedUris: filters.bannedUris || [],
      excludeTrackIds: filters.excludeTrackIds || [],
      excludeArtistIds: filters.excludeArtistIds || [],
      seedTrackIds: filters.seedTrackIds || [],
      includeSeedTracks: !!filters.includeSeedTracks,
    };

    const { tracks, radios, rawTotal, playlistsUsed, rateLimited, camelotMatched } =
      await collectCandidates({
        seedTrackIds,
        seedTracks,
        rawTarget,
        camelotMoves,
        camelotSeeds,
        matchTarget: camelotMoves.length ? matchTarget : null,
        progressFilters,
      });

    if (!rawTotal) {
      throw new Error(
        usedSoftSeeds
          ? "No candidates from this playlist — try marking seed tracks"
          : "Song Radio returned no playlists for the selected seeds"
      );
    }

    let pool = tracks.slice();

    // Keys first, then Mix in Key, then hide-existing / feature ranges.
    if (camelotMoves.length && typeof MixAppFeatures?.enrichTracks === "function") {
      try {
        pool = await MixAppFeatures.enrichTracks(pool);
      } catch (err) {
        console.warn("Weave: recommend enrich failed", err);
        await ensureCamelotKeys(pool);
      }
      pool = MixAppFeatures.filterTracksByCamelotMoves(
        pool,
        camelotSeeds,
        camelotMoves
      );
    }

    pool = applyPostFilters(pool, filters);
    pool = await filterByLocalFeatures(pool, features);
    pool = sampleResults(
      pool,
      camelotMoves.length ? matchTarget : target,
      opts.avoidUris || []
    );

    return {
      tracks: pool,
      featuresUsed: features,
      engine: "song-radio",
      radioCount: radios,
      playlistsUsed,
      rawTotal,
      usedSoftSeeds,
      rateLimited: !!rateLimited,
      camelotMatched,
      camelotApplied: camelotMoves.length > 0,
    };
  }

  function sampleValueForFeature(sample, defId) {
    if (!sample || !defId) return null;
    if (sample[defId] != null && !Number.isNaN(Number(sample[defId]))) {
      return Number(sample[defId]);
    }
    if (defId === "tempo") {
      const t = sample.tempo ?? sample.bpm;
      if (t != null && !Number.isNaN(Number(t))) return Number(t);
    }
    return null;
  }

  /** Mean of each FEATURE_DEFS field over tracks/samples (null if no values). */
  function averagesFromTracks(tracks) {
    /** @type {Record<string, number>} */
    const out = {};
    if (!tracks?.length) return out;
    for (const def of FEATURE_DEFS) {
      const values = tracks
        .map((t) => sampleValueForFeature(t, def.id))
        .filter((v) => v != null);
      if (!values.length) continue;
      out[def.id] = values.reduce((a, b) => a + b, 0) / values.length;
    }
    return out;
  }

  function featuresFromSamples(samples) {
    const state = defaultFeatureState();
    if (!samples?.length) return state;

    for (const def of FEATURE_DEFS) {
      const values = samples
        .map((s) => sampleValueForFeature(s, def.id))
        .filter((v) => v != null);
      if (!values.length) continue;
      const minV = Math.min(...values);
      const maxV = Math.max(...values);
      const pad = featurePad(def);
      state[def.id] = {
        enabled: true,
        aroundAvg: false,
        min: Math.max(def.min, minV - pad),
        max: Math.min(def.max, maxV + pad),
      };
    }
    return state;
  }

  return {
    FEATURE_DEFS,
    DEFAULT_LIMIT,
    MAX_LIMIT,
    defaultFeatureState,
    featurePad,
    rangeAroundValue,
    recommend,
    applyPostFilters,
    sampleResults,
    isAberrantTitle,
    trackIdFromUri,
    trackFingerprint,
    featuresFromSamples,
    averagesFromTracks,
  };
})();
