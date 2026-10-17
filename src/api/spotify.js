//@ts-check
/** Playlist load / save helpers for MixApp (Platform API + Web API fallback). */

const MixAppApi = (() => {
  function notify(message, isError) {
    if (Spicetify?.showNotification) {
      Spicetify.showNotification(message, !!isError);
    }
  }

  function playlistIdFromUri(uri) {
    if (!uri) return null;
    const parts = String(uri).split(":");
    return parts[parts.length - 1] || null;
  }

  /** CosmosAsync often resolves with `{ error }` instead of throwing. */
  function assertCosmosOk(response, context) {
    if (response == null) return response;
    if (typeof response !== "object") return response;
    if (!("error" in response)) return response;
    const err = response.error;
    if (typeof err === "string") throw new Error(`${context}: ${err}`);
    const status = err?.status ?? err?.statusCode;
    const message = err?.message || err?.error_description || "request failed";
    throw new Error(
      status != null ? `${context}: ${status} — ${message}` : `${context}: ${message}`
    );
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isRateLimitError(err) {
    const msg = String(err?.message || err || "");
    return (
      msg.includes("429") ||
      /rate.?limit/i.test(msg) ||
      /too many requests/i.test(msg)
    );
  }

  function parseRetryAfterMs(err) {
    const msg = String(err?.message || err || "");
    const m = msg.match(/retry[- ]after[:\s]*(\d+)/i);
    if (m) {
      const sec = parseInt(m[1], 10);
      if (Number.isFinite(sec) && sec > 0) return Math.min(60000, sec * 1000);
    }
    return null;
  }

  let rateLimitNotifyAt = 0;

  async function withRetry(
    fn,
    { retries = 6, label = "request", notifyUser = true } = {}
  ) {
    let lastErr;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (!isRateLimitError(err) || attempt === retries - 1) throw err;
        const retryAfter = parseRetryAfterMs(err);
        const delay =
          retryAfter != null
            ? retryAfter
            : Math.min(20000, 800 * Math.pow(2, attempt));
        console.warn(`MixApp: ${label} rate-limited, retry in ${delay}ms`);
        if (notifyUser && Date.now() - rateLimitNotifyAt > 4000) {
          rateLimitNotifyAt = Date.now();
          notify(
            "Spotify rate limit — backing off " +
              Math.ceil(delay / 1000) +
              "s…",
            true
          );
        }
        await sleep(delay);
      }
    }
    throw lastErr;
  }

  async function cosmosGet(url, opts = {}) {
    return withRetry(
      async () => {
        const res = await Spicetify.CosmosAsync.get(url);
        return assertCosmosOk(res, url);
      },
      {
        retries: opts.retries ?? 5,
        label: opts.label || "request",
        notifyUser: opts.notifyUser !== false,
      }
    );
  }

  async function cosmosPost(url, body, opts = {}) {
    return withRetry(
      async () => {
        const res = await Spicetify.CosmosAsync.post(url, body);
        return assertCosmosOk(res, url);
      },
      {
        retries: opts.retries ?? 5,
        label: opts.label || "request",
        notifyUser: opts.notifyUser !== false,
      }
    );
  }

  async function cosmosPut(url, body, opts = {}) {
    return withRetry(
      async () => {
        const res = await Spicetify.CosmosAsync.put(url, body);
        return assertCosmosOk(res, url);
      },
      {
        retries: opts.retries ?? 5,
        label: opts.label || "request",
        notifyUser: opts.notifyUser !== false,
      }
    );
  }

  function formatDuration(ms) {
    if (ms == null || Number.isNaN(ms)) return "—";
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function pickAttr(obj, ...keys) {
    if (!obj) return null;
    for (const key of keys) {
      const v = obj[key];
      if (v != null && v !== "") return v;
    }
    return null;
  }

  function normalizeTrack(raw, index) {
    const track = raw?.track || raw?.item || raw;
    const album = track?.album || raw?.album || {};
    const artists =
      track?.artists ||
      raw?.artists ||
      (track?.artist ? [track.artist] : []) ||
      [];
    const uri = track?.uri || raw?.uri || "";
    const uid = raw?.uid || raw?.addTime || `${uri}:${index}`;
    const attrs = raw?.formatListAttributes || track?.formatListAttributes || {};
    const bpm = pickAttr(
      attrs,
      "bpm",
      "tempo",
      "musical-bpm"
    ) ?? pickAttr(track, "bpm", "tempo") ?? pickAttr(raw, "bpm", "tempo");
    const key = pickAttr(
      attrs,
      "key",
      "musical-key",
      "camelot"
    ) ?? pickAttr(track, "key", "musicalKey") ?? pickAttr(raw, "key");
    const artistList = Array.isArray(artists) ? artists : [];
    const release =
      album?.date?.isoString ||
      album?.release_date ||
      album?.date ||
      raw?.addedAt ||
      null;
    let year = null;
    if (release) {
      const y = parseInt(String(release).slice(0, 4), 10);
      if (Number.isFinite(y)) year = y;
    }
    const id =
      track?.id ||
      (uri && String(uri).includes(":track:")
        ? String(uri).split(":").pop()
        : null);

    return {
      uri,
      uid: String(uid),
      id,
      name: track?.name || raw?.name || "Unknown",
      artists: artistList
        .map((a) => a?.name || a)
        .filter(Boolean)
        .join(", "),
      artistIds: artistList
        .map((a) => a?.id || (a?.uri ? String(a.uri).split(":").pop() : null))
        .filter(Boolean),
      album: album?.name || raw?.albumName || "",
      albumId:
        album?.id ||
        (album?.uri && String(album.uri).includes(":album:")
          ? String(album.uri).split(":").pop()
          : null) ||
        null,
      albumUri: album?.uri || null,
      durationMs: track?.duration?.milliseconds ?? track?.duration_ms ?? raw?.durationMs ?? 0,
      explicit: !!(track?.explicit || raw?.explicit),
      addedAt: raw?.addedAt || raw?.added_at || track?.addedAt || null,
      year,
      bpm: bpm != null ? (typeof bpm === "number" ? Math.round(bpm) : String(bpm)) : null,
      key: key != null ? String(key) : null,
    };
  }

  async function listPlaylists() {
    const LibraryAPI = Spicetify?.Platform?.LibraryAPI;
    if (LibraryAPI?.getContents) {
      try {
        const result = await LibraryAPI.getContents({
          filters: ["2"],
          offset: 0,
          limit: 10000,
          includeLocalFiles: false,
          includeYourEpisodes: false,
        });
        const items = (result?.items || [])
          .filter((item) => item?.type === "playlist" || item?.uri?.includes(":playlist:"))
          .map((item) => {
            const isOwnedBySelf = !!(item.isOwnedBySelf ?? item.ownedBySelf);
            const canEdit =
              typeof item.canEdit === "boolean"
                ? item.canEdit
                : isOwnedBySelf || !!item.collaborative;
            return {
              uri: item.uri,
              name: item.name || "Untitled",
              collaborative: !!item.collaborative,
              canEdit,
              isOwnedBySelf,
              totalLength: item.totalLength ?? item.length ?? null,
            };
          });
        if (items.length) return items;
      } catch (err) {
        console.warn("MixApp: LibraryAPI.getContents failed", err);
      }
    }

    const me = await getCurrentUserId();
    const playlists = [];
    let url = "https://api.spotify.com/v1/me/playlists?limit=50";
    while (url) {
      const page = await cosmosGet(url);
      for (const p of page?.items || []) {
        const isOwnedBySelf = p.owner?.id === me;
        playlists.push({
          uri: p.uri,
          name: p.name || "Untitled",
          collaborative: !!p.collaborative,
          isOwnedBySelf,
          canEdit: isOwnedBySelf || !!p.collaborative,
          totalLength: p.items?.total ?? p.tracks?.total ?? null,
        });
      }
      url = page?.next || null;
    }
    return playlists;
  }

  let cachedUserId = null;
  async function getCurrentUserId() {
    if (cachedUserId) return cachedUserId;
    try {
      const me = await cosmosGet("https://api.spotify.com/v1/me");
      cachedUserId = me?.id || null;
    } catch (err) {
      console.warn("MixApp: failed to fetch /me", err);
    }
    return cachedUserId;
  }

  async function getPlaylistMeta(uri) {
    const PlaylistAPI = Spicetify?.Platform?.PlaylistAPI;
    if (PlaylistAPI?.getMetadata) {
      try {
        const meta = await PlaylistAPI.getMetadata(uri);
        return {
          uri: meta?.uri || uri,
          name: meta?.name || "Playlist",
          description: meta?.description || "",
          isOwnedBySelf: !!(meta?.isOwnedBySelf ?? meta?.ownedBySelf),
          collaborative: !!meta?.collaborative,
          totalLength: meta?.totalLength ?? null,
        };
      } catch (err) {
        console.warn("MixApp: PlaylistAPI.getMetadata failed", err);
      }
    }

    const id = playlistIdFromUri(uri);
    const meta = await cosmosGet(`https://api.spotify.com/v1/playlists/${id}`);
    const me = await getCurrentUserId();
    return {
      uri: meta.uri || uri,
      name: meta.name || "Playlist",
      description: meta.description || "",
      isOwnedBySelf: meta.owner?.id === me,
      collaborative: !!meta.collaborative,
      totalLength: meta.items?.total ?? meta.tracks?.total ?? null,
    };
  }

  async function getPlaylistTracks(uri) {
    const PlaylistAPI = Spicetify?.Platform?.PlaylistAPI;
    if (PlaylistAPI?.getContents) {
      try {
        const contents = await PlaylistAPI.getContents(uri);
        const items = contents?.items || [];
        return items
          .filter((item) => {
            const t = item?.track || item?.item || item;
            const type = t?.type || item?.type;
            return !type || type === "track" || (t?.uri || item?.uri || "").includes(":track:");
          })
          .map((item, i) => normalizeTrack(item, i));
      } catch (err) {
        console.warn("MixApp: PlaylistAPI.getContents failed", err);
      }
    }

    const id = playlistIdFromUri(uri);
    const tracks = [];
    // Feb 2026: /tracks removed — use /items
    let url = `https://api.spotify.com/v1/playlists/${id}/items?limit=100`;
    let index = 0;
    while (url) {
      const page = await cosmosGet(url);
      for (const row of page?.items || []) {
        const track = row?.item || row?.track;
        if (!track || track.is_local) continue;
        if (track.type && track.type !== "track") continue;
        tracks.push(normalizeTrack(row, index++));
      }
      url = page?.next || null;
    }
    return tracks;
  }

  /** Synthetic MixApp uids — not Spotify playlist-item uids (mixing attrs live on those). */
  function isSpotifyItemUid(uid) {
    if (!uid) return false;
    const s = String(uid);
    if (s.startsWith("added:") || s.startsWith("rec:") || s.startsWith("web:")) {
      return false;
    }
    // normalizeTrack fallback: `${uri}:${index}`
    if (/^spotify:(track|episode):[^:]+:\d+$/.test(s)) return false;
    return true;
  }

  function liveItemFromRaw(item) {
    const trackUri = item?.uri || item?.track?.uri || item?.item?.uri;
    const uid = item?.uid;
    if (!trackUri || !uid) return null;
    return { uri: trackUri, uid: String(uid) };
  }

  async function getLivePlaylistItems(uri) {
    const PlaylistAPI = Spicetify?.Platform?.PlaylistAPI;
    if (PlaylistAPI?.getContents) {
      const contents = await PlaylistAPI.getContents(uri);
      return (contents?.items || []).map(liveItemFromRaw).filter(Boolean);
    }
    // Web API has no item uids — cannot preserve mixing settings this way.
    throw new Error("PlaylistAPI.getContents unavailable; cannot sync without replacing");
  }

  async function playlistApiRemove(uri, items) {
    const PlaylistAPI = Spicetify?.Platform?.PlaylistAPI;
    if (!PlaylistAPI?.remove) throw new Error("PlaylistAPI.remove unavailable");
    const remChunk = 50;
    for (let i = 0; i < items.length; i += remChunk) {
      await PlaylistAPI.remove(uri, items.slice(i, i + remChunk));
    }
  }

  async function playlistApiAdd(uri, trackUris, opts) {
    const PlaylistAPI = Spicetify?.Platform?.PlaylistAPI;
    if (!PlaylistAPI?.add) throw new Error("PlaylistAPI.add unavailable");
    const addChunk = 100;
    for (let i = 0; i < trackUris.length; i += addChunk) {
      const chunk = trackUris.slice(i, i + addChunk);
      if (chunk.length) await PlaylistAPI.add(uri, chunk, opts || { after: "end" });
    }
  }

  /**
   * Move one item by index via Web API reorder (keeps item uid / mixing attrs).
   * Spotify lifts the range out first, so to land at final index `to`:
   *   insert_before = from < to ? to + 1 : to
   */
  async function reorderItemByIndex(playlistId, from, to, snapshotId) {
    if (from === to) return snapshotId;
    const insertBefore = from < to ? to + 1 : to;
    const body = {
      range_start: from,
      insert_before: insertBefore,
      range_length: 1,
    };
    if (snapshotId) body.snapshot_id = snapshotId;
    const res = await withRetry(
      () =>
        cosmosPut(`https://api.spotify.com/v1/playlists/${playlistId}/items`, body),
      { label: "playlist reorder" }
    );
    return res?.snapshot_id || snapshotId || null;
  }

  function sameUidOrder(a, b) {
    return a.length === b.length && a.every((uid, i) => uid === b[i]);
  }

  /**
   * Reorder by moving each out-of-prefix item to the end, in target order.
   * Using only `{ after: "end" }` avoids ambiguous before/after placement.
   * Prefers Platform PlaylistAPI.move (no Web API rate limits).
   */
  async function reorderViaPlaylistMove(playlistUri, live, targetUids) {
    const PlaylistAPI = Spicetify?.Platform?.PlaylistAPI;
    if (typeof PlaylistAPI?.move !== "function") return false;

    const byUid = new Map(live.map((l) => [l.uid, l]));
    const current = live.map((l) => l.uid);
    if (sameUidOrder(current, targetUids)) return true;

    let start = 0;
    while (start < targetUids.length && current[start] === targetUids[start]) {
      start += 1;
    }

    try {
      for (let i = start; i < targetUids.length; i++) {
        const uid = targetUids[i];
        const item = byUid.get(uid);
        if (!item) return false;
        try {
          await PlaylistAPI.move(
            playlistUri,
            [{ uri: item.uri, uid: item.uid }],
            { after: "end" }
          );
        } catch (_) {
          // Some clients want bare uids instead of {uri,uid} objects.
          await PlaylistAPI.move(playlistUri, [item.uid], { after: "end" });
        }
        const from = current.indexOf(uid);
        if (from >= 0) {
          current.splice(from, 1);
          current.push(uid);
        }
      }
      const fresh = await getLivePlaylistItems(playlistUri);
      return sameUidOrder(
        fresh.map((l) => l.uid),
        targetUids
      );
    } catch (err) {
      console.warn("MixApp: PlaylistAPI.move reorder failed", err);
      return false;
    }
  }

  /** Web API fallback: same move-to-end strategy, with 429 retries + spacing. */
  async function reorderViaWebApi(playlistUri, targetUids) {
    const id = playlistIdFromUri(playlistUri);
    if (!id) throw new Error("Invalid playlist URI");

    let live = await getLivePlaylistItems(playlistUri);
    let current = live.map((l) => l.uid);
    if (sameUidOrder(current, targetUids)) return;

    let start = 0;
    while (start < targetUids.length && current[start] === targetUids[start]) {
      start += 1;
    }

    let snapshotId = null;
    for (let i = start; i < targetUids.length; i++) {
      const want = targetUids[i];
      const from = current.indexOf(want);
      if (from < 0) {
        throw new Error("Reorder lost track uid — save aborted");
      }
      const to = current.length - 1;
      if (from !== to) {
        snapshotId = await reorderItemByIndex(id, from, to, snapshotId);
        await sleep(200);
        const [uid] = current.splice(from, 1);
        current.push(uid);
      }
    }

    const fresh = await getLivePlaylistItems(playlistUri);
    if (
      !sameUidOrder(
        fresh.map((l) => l.uid),
        targetUids
      )
    ) {
      throw new Error("Failed to reorder playlist to match editor order");
    }
  }

  async function reorderLiveToTarget(playlistUri, live, targetUids) {
    if (sameUidOrder(live.map((l) => l.uid), targetUids)) return;
    if (await reorderViaPlaylistMove(playlistUri, live, targetUids)) return;
    await reorderViaWebApi(playlistUri, targetUids);
  }

  /**
   * Differential save: remove / add / reorder only.
   * Keeps Spotify playlist-item uids so per-track mixing settings survive.
   */
  async function syncPlaylistTracks(uri, desiredTracks) {
    const desired = (desiredTracks || []).filter((t) => t?.uri);
    let live = await getLivePlaylistItems(uri);

    const used = new Set();
    /** @type {{ uri: string, uid: string|null, isNew: boolean }[]} */
    const plan = [];

    for (const t of desired) {
      if (isSpotifyItemUid(t.uid)) {
        const hit = live.find((l) => l.uid === t.uid && !used.has(l.uid));
        if (hit) {
          used.add(hit.uid);
          plan.push({ uri: hit.uri, uid: hit.uid, isNew: false });
          continue;
        }
      }
      const hit = live.find((l) => l.uri === t.uri && !used.has(l.uid));
      if (hit) {
        used.add(hit.uid);
        plan.push({ uri: hit.uri, uid: hit.uid, isNew: false });
      } else {
        plan.push({ uri: t.uri, uid: null, isNew: true });
      }
    }

    const toRemove = live.filter((l) => !used.has(l.uid));
    if (toRemove.length) {
      await playlistApiRemove(uri, toRemove);
    }

    const toAdd = plan.filter((p) => p.isNew).map((p) => p.uri);
    if (toAdd.length) {
      await playlistApiAdd(uri, toAdd, { after: "end" });
    }

    // Refresh and resolve uids for newly added rows (preserve order of first unused uri match).
    live = await getLivePlaylistItems(uri);
    const claimed = new Set();
    const targetUids = [];
    for (const p of plan) {
      if (!p.isNew && p.uid && live.some((l) => l.uid === p.uid)) {
        claimed.add(p.uid);
        targetUids.push(p.uid);
        continue;
      }
      const hit = live.find((l) => l.uri === p.uri && !claimed.has(l.uid));
      if (!hit) {
        throw new Error(`Missing playlist item after sync: ${p.uri}`);
      }
      claimed.add(hit.uid);
      targetUids.push(hit.uid);
    }

    // Drop any unexpected leftovers (race / concurrent edit).
    const extras = live.filter((l) => !claimed.has(l.uid));
    if (extras.length) {
      await playlistApiRemove(uri, extras);
      live = await getLivePlaylistItems(uri);
    }

    const liveUids = live.map((l) => l.uid);
    const alreadyOrdered =
      liveUids.length === targetUids.length &&
      liveUids.every((uid, i) => uid === targetUids[i]);
    if (!alreadyOrdered) {
      await reorderLiveToTarget(uri, live, targetUids);
    }

    // Return fresh tracks so callers can refresh uids for next save.
    return getPlaylistTracks(uri);
  }

  /** Full replace — only for brand-new playlists (no mixing settings to keep). */
  async function replacePlaylistTracks(uri, trackUris) {
    const id = playlistIdFromUri(uri);
    if (!id) throw new Error("Invalid playlist URI");
    const chunkSize = 100;
    for (let i = 0; i < Math.max(trackUris.length, 1); i += chunkSize) {
      const chunk = trackUris.slice(i, i + chunkSize);
      if (i === 0) {
        await cosmosPut(`https://api.spotify.com/v1/playlists/${id}/items`, {
          uris: chunk,
        });
      } else if (chunk.length) {
        await cosmosPost(`https://api.spotify.com/v1/playlists/${id}/items`, {
          uris: chunk,
        });
      }
    }
  }

  async function createPlaylist(name, trackUris) {
    const RootlistAPI = Spicetify?.Platform?.RootlistAPI;
    let uri = null;

    if (RootlistAPI?.createPlaylist) {
      try {
        const created = await RootlistAPI.createPlaylist(name);
        uri = created?.uri || created;
      } catch (err) {
        console.warn("MixApp: RootlistAPI.createPlaylist failed", err);
      }
    }

    if (!uri) {
      const created = await cosmosPost("https://api.spotify.com/v1/me/playlists", {
        name,
        public: false,
      });
      uri = created?.uri;
    }

    if (!uri) throw new Error("Failed to create playlist");
    if (trackUris?.length) {
      await replacePlaylistTracks(uri, trackUris);
    }
    return uri;
  }

  async function saveOverwrite(uri, tracks) {
    return syncPlaylistTracks(uri, tracks);
  }

  function normalizeCatalogTrack(raw, index) {
    const track = raw?.track || raw;
    const artists = Array.isArray(track?.artists) ? track.artists : [];
    const album = track?.album || {};
    const id = track?.id || playlistIdFromUri(track?.uri);
    const uri = track?.uri || (id ? "spotify:track:" + id : "");
    const release = album?.release_date || album?.date || null;
    let year = null;
    if (release) {
      const y = parseInt(String(release).slice(0, 4), 10);
      if (Number.isFinite(y)) year = y;
    }
    return {
      uri,
      uid: "search:" + (id || uri || index) + ":" + index,
      id,
      name: track?.name || "Unknown",
      artists: artists.map((a) => a?.name || a).filter(Boolean).join(", "),
      artistIds: artists
        .map((a) => a?.id || (a?.uri ? String(a.uri).split(":").pop() : null))
        .filter(Boolean),
      album: album?.name || "",
      albumId: album?.id || null,
      albumUri: album?.uri || null,
      durationMs: track?.duration_ms ?? track?.duration?.milliseconds ?? 0,
      explicit: !!track?.explicit,
      year,
      bpm: null,
      key: null,
      addedAt: null,
    };
  }

  function graphqlEntity(entry) {
    return (
      entry?.item?.data ||
      entry?.itemV2?.data ||
      entry?.data ||
      entry?.item ||
      entry
    );
  }

  function artistNamesFromGraphql(data) {
    const raw = data?.artists;
    if (Array.isArray(raw?.items)) {
      return raw.items
        .map((a) => a?.profile?.name || a?.name)
        .filter(Boolean);
    }
    if (Array.isArray(raw)) {
      return raw
        .map((a) => a?.profile?.name || a?.name || a)
        .filter(Boolean);
    }
    if (data?.artist?.profile?.name) return [data.artist.profile.name];
    if (typeof data?.artistName === "string") return [data.artistName];
    return [];
  }

  function artistIdsFromGraphql(data) {
    const raw = data?.artists;
    const list = Array.isArray(raw?.items)
      ? raw.items
      : Array.isArray(raw)
        ? raw
        : [];
    return list
      .map((a) => a?.id || playlistIdFromUri(a?.uri))
      .filter(Boolean);
  }

  function normalizeGraphqlTrack(data, index) {
    if (!data) return null;
    const uri =
      data.uri || (data.id ? "spotify:track:" + data.id : "");
    if (!uri || !String(uri).includes(":track:")) return null;
    const id = data.id || playlistIdFromUri(uri);
    const album = data.albumOfTrack || data.album || {};
    const durationMs =
      data.duration?.totalMilliseconds ??
      data.duration?.milliseconds ??
      data.duration_ms ??
      data.durationMs ??
      0;
    const rating = data.contentRating?.label || data.contentRating || "";
    const explicit =
      !!data.explicit ||
      String(rating).toUpperCase() === "EXPLICIT";
    const release =
      album?.date?.isoString ||
      album?.date?.year ||
      album?.release_date ||
      null;
    let year = null;
    if (release != null) {
      const y = parseInt(String(release).slice(0, 4), 10);
      if (Number.isFinite(y)) year = y;
    }
    return {
      uri,
      uid: "search:" + (id || uri) + ":" + index,
      id,
      name: data.name || data.title || "Unknown",
      artists: artistNamesFromGraphql(data).join(", "),
      artistIds: artistIdsFromGraphql(data),
      album: album?.name || "",
      albumId: album?.id || playlistIdFromUri(album?.uri) || null,
      albumUri: album?.uri || null,
      durationMs,
      explicit,
      year,
      bpm: null,
      key: null,
      addedAt: null,
    };
  }

  function normalizeGraphqlPlaylist(data) {
    if (!data?.uri || !String(data.uri).includes(":playlist:")) return null;
    const owner =
      data.ownerV2?.data?.name ||
      data.ownerV2?.name ||
      data.owner?.name ||
      data.owner?.displayName ||
      "";
    const total =
      data.content?.totalCount ??
      data.tracks?.totalCount ??
      data.tracks?.total ??
      null;
    return {
      uri: data.uri,
      name: data.name || "Untitled",
      collaborative: !!data.collaborative,
      isOwnedBySelf: false,
      canEdit: false,
      totalLength: total,
      ownerName: owner,
    };
  }

  function collectGraphqlItems(searchV2, preferKeys) {
    const out = [];
    const seen = new Set();
    const keys =
      Array.isArray(preferKeys) && preferKeys.length
        ? preferKeys
        : Object.keys(searchV2 || {});
    for (const key of keys) {
      const section = searchV2?.[key];
      if (!section || typeof section !== "object") continue;
      const list = section.itemsV2 || section.items;
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        const data = graphqlEntity(entry);
        const uri = data?.uri;
        if (!uri || seen.has(uri)) continue;
        seen.add(uri);
        out.push(data);
      }
    }
    return out;
  }

  /**
   * Client Pathfinder search — Web API /v1/search is 403/404/429 for desktop tokens.
   */
  async function graphqlSearchV2(query, limit) {
    const GQL = Spicetify?.GraphQL;
    const defs = GQL?.Definitions;
    if (!GQL?.Request || !defs) return null;

    const attempts = [];
    if (defs.searchModalResults) {
      attempts.push([
        defs.searchModalResults,
        {
          searchTerm: query,
          offset: 0,
          limit,
          numberOfTopResults: Math.min(limit, 20),
          includeAudiobooks: false,
          includeAuthors: false,
          includePreRelease: true,
          includeArtistHasConcertsField: false,
        },
      ]);
    }
    if (defs.searchSuggestions) {
      attempts.push([
        defs.searchSuggestions,
        {
          query,
          offset: 0,
          limit,
          numberOfTopResults: Math.min(limit, 20),
          includeAuthors: false,
          includeAlbumPreReleases: true,
          includeEpisodeContentRatingsV2: false,
        },
      ]);
    }
    if (defs.searchDesktop) {
      attempts.push([
        defs.searchDesktop,
        {
          searchTerm: query,
          offset: 0,
          limit,
          numberOfTopResults: Math.min(limit, 20),
          includeAudiobooks: false,
          includeArtistHasConcertsField: false,
          includePreReleases: true,
        },
      ]);
    }

    for (const [definition, variables] of attempts) {
      try {
        const res = await GQL.Request(definition, variables);
        if (res?.errors?.length) {
          console.warn("MixApp GraphQL search errors", res.errors);
          continue;
        }
        const searchV2 = res?.data?.searchV2 || res?.searchV2;
        if (searchV2) return searchV2;
      } catch (err) {
        console.warn("MixApp GraphQL search attempt failed", err);
      }
    }
    return null;
  }

  /** Last resort — often 404/429 under client token. */
  async function searchTracksWebApi(query, want) {
    const out = [];
    let offset = 0;
    while (out.length < want) {
      const pageSize = Math.min(10, want - out.length);
      const url =
        "https://api.spotify.com/v1/search?type=track&limit=" +
        pageSize +
        "&offset=" +
        offset +
        "&q=" +
        encodeURIComponent(query);
      const res = await cosmosGet(url, {
        retries: 3,
        label: "track search",
      });
      const items = res?.tracks?.items || [];
      if (!items.length) break;
      for (let i = 0; i < items.length; i++) {
        out.push(normalizeCatalogTrack(items[i], out.length + i));
      }
      offset += items.length;
      if (!res?.tracks?.next || items.length < pageSize) break;
    }
    return out;
  }

  async function searchPlaylistsWebApi(query, want) {
    const out = [];
    let offset = 0;
    while (out.length < want) {
      const pageSize = Math.min(10, want - out.length);
      const url =
        "https://api.spotify.com/v1/search?type=playlist&limit=" +
        pageSize +
        "&offset=" +
        offset +
        "&q=" +
        encodeURIComponent(query);
      const res = await cosmosGet(url, {
        retries: 3,
        label: "playlist search",
      });
      const items = res?.playlists?.items || [];
      if (!items.length) break;
      for (const p of items) {
        if (!p?.uri) continue;
        out.push({
          uri: p.uri,
          name: p.name || "Untitled",
          collaborative: !!p.collaborative,
          isOwnedBySelf: false,
          canEdit: false,
          totalLength: p.items?.total ?? p.tracks?.total ?? null,
          ownerName: p.owner?.display_name || p.owner?.id || "",
        });
      }
      offset += items.length;
      if (!res?.playlists?.next || items.length < pageSize) break;
    }
    return out;
  }

  /**
   * Catalog track search via client GraphQL (preferred) or Web API fallback.
   */
  async function searchTracks(query, opts = {}) {
    const q = String(query || "").trim();
    if (!q) return [];
    const want = Math.min(50, Math.max(1, Number(opts.limit) || 20));

    const searchV2 = await graphqlSearchV2(q, want);
    if (searchV2) {
      let entities = collectGraphqlItems(searchV2, [
        "tracksV2",
        "tracks",
        "topResultsV2",
        "topResults",
      ]);
      if (!entities.length) entities = collectGraphqlItems(searchV2, null);
      const out = [];
      const seen = new Set();
      for (const data of entities) {
        const track = normalizeGraphqlTrack(data, out.length);
        if (!track?.uri || seen.has(track.uri)) continue;
        seen.add(track.uri);
        out.push(track);
        if (out.length >= want) break;
      }
      // GraphQL answered — do not fall through to rate-limited Web API.
      return out;
    }

    try {
      return await searchTracksWebApi(q, want);
    } catch (err) {
      console.error("MixApp track search failed", err);
      throw new Error(
        "Catalog search unavailable (client search blocked). Try again in a moment."
      );
    }
  }

  async function searchPlaylists(query, opts = {}) {
    const q = String(query || "").trim();
    if (!q) return [];
    const want = Math.min(30, Math.max(1, Number(opts.limit) || 15));

    const searchV2 = await graphqlSearchV2(q, want);
    if (searchV2) {
      let entities = collectGraphqlItems(searchV2, [
        "playlistsV2",
        "playlists",
        "topResultsV2",
        "topResults",
      ]);
      if (!entities.length) entities = collectGraphqlItems(searchV2, null);
      const out = [];
      const seen = new Set();
      for (const data of entities) {
        const pl = normalizeGraphqlPlaylist(data);
        if (!pl?.uri || seen.has(pl.uri)) continue;
        seen.add(pl.uri);
        out.push(pl);
        if (out.length >= want) break;
      }
      return out;
    }

    try {
      return await searchPlaylistsWebApi(q, want);
    } catch (err) {
      console.error("MixApp playlist search failed", err);
      throw new Error(
        "Playlist search unavailable (client search blocked). Try again in a moment."
      );
    }
  }

  return {
    notify,
    formatDuration,
    listPlaylists,
    getPlaylistMeta,
    getPlaylistTracks,
    createPlaylist,
    saveOverwrite,
    getCurrentUserId,
    searchTracks,
    searchPlaylists,
    withRetry,
    isRateLimitError,
  };
})();
