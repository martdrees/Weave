//@ts-check
/**
 * Playlist list / load / differential sync / create.
 */

const MixAppPlaylists = (() => {
  /** URIs confirmed missing/private this session (load failed). */
  const unavailableUris = new Set();

  function normalizeTrack(raw, index) {
    return MixAppTrack.fromPlaylistItem(raw, index);
  }

  function markPlaylistUnavailable(uri) {
    if (!uri) return;
    unavailableUris.add(String(uri));
  }

  /** Spotify library placeholders for deleted / private playlists. */
  function isUnavailablePlaylistName(name) {
    const n = String(name || "").trim();
    if (!n) return true;
    if (/^playlist not available$/i.test(n)) return true;
    if (/^not available$/i.test(n)) return true;
    if (/^playlist nicht verfügbar$/i.test(n)) return true;
    if (/^nicht verfügbar$/i.test(n)) return true;
    if (/\bnot available\b/i.test(n)) return true;
    if (/nicht verfügbar/i.test(n)) return true;
    if (/no disponible/i.test(n)) return true;
    if (/non disponible/i.test(n)) return true;
    if (/non disponibile/i.test(n)) return true;
    if (/indispon[ií]vel/i.test(n)) return true;
    if (/недоступн/i.test(n)) return true;
    if (/利用できません|利用不可/i.test(n)) return true;
    return false;
  }

  /**
   * Drop library rows Spotify marks unavailable (or we already failed to load).
   * @param {object} item
   */
  function isLibraryPlaylistUnavailable(item) {
    if (!item?.uri) return true;
    if (unavailableUris.has(String(item.uri))) return true;
    if (item.isAvailable === false || item.available === false) return true;
    if (item.isUnavailable === true || item.unavailable === true) return true;
    if (item.contentsAvailable === false) return true;
    if (item.canOpen === false || item.canView === false) return true;
    if (isUnavailablePlaylistName(item.name)) return true;
    return false;
  }

  function mapLibraryPlaylist(item) {
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
          .filter(
            (item) =>
              (item?.type === "playlist" || item?.uri?.includes(":playlist:")) &&
              !isLibraryPlaylistUnavailable(item)
          )
          .map(mapLibraryPlaylist);
        if (items.length) return items;
      } catch (err) {
        console.warn("Weave: LibraryAPI.getContents failed", err);
      }
    }

    const me = await getCurrentUserId();
    const playlists = [];
    let url = "https://api.spotify.com/v1/me/playlists?limit=50";
    while (url) {
      const page = await MixAppHttp.cosmosGet(url);
      for (const p of page?.items || []) {
        if (isLibraryPlaylistUnavailable(p)) continue;
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
      const me = await MixAppHttp.cosmosGet("https://api.spotify.com/v1/me");
      cachedUserId = me?.id || null;
    } catch (err) {
      console.warn("Weave: failed to fetch /me", err);
    }
    return cachedUserId;
  }

  async function getPlaylistMeta(uri) {
    const PlaylistAPI = Spicetify?.Platform?.PlaylistAPI;
    if (PlaylistAPI?.getMetadata) {
      for (const candidate of playlistUriCandidates(uri)) {
        try {
          const meta = await PlaylistAPI.getMetadata(candidate);
          if (meta) {
            return {
              uri: meta?.uri || uri,
              name: meta?.name || "Playlist",
              description: meta?.description || "",
              isOwnedBySelf: !!(meta?.isOwnedBySelf ?? meta?.ownedBySelf),
              collaborative: !!meta?.collaborative,
              totalLength: meta?.totalLength ?? null,
            };
          }
        } catch (err) {
          console.warn("Weave: PlaylistAPI.getMetadata failed", err);
        }
      }
    }

    const id = MixAppHttp.playlistIdFromUri(uri);
    const meta = await MixAppHttp.cosmosGet(
      `https://api.spotify.com/v1/playlists/${id}`,
      { retries: 6, label: "playlist meta" }
    );
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

  function playlistUriCandidates(uri) {
    const raw = String(uri || "");
    const id = MixAppHttp.playlistIdFromUri(raw);
    const out = [];
    const push = (u) => {
      if (u && !out.includes(u)) out.push(u);
    };
    push(raw);
    if (id) {
      push(`spotify:playlist:${id}`);
      push(`spotify:playlist-v2:${id}`);
    }
    return out;
  }

  function mapPlatformContents(contents) {
    const items = contents?.items || [];
    return items
      .filter((item) => {
        const t = item?.track || item?.item || item;
        const type = t?.type || item?.type;
        return (
          !type ||
          type === "track" ||
          (t?.uri || item?.uri || "").includes(":track:")
        );
      })
      .map((item, i) => normalizeTrack(item, i));
  }

  function isInvalidPlaylistResponse(err) {
    return /invalid playlist response/i.test(String(err?.message || err || ""));
  }

  function playlistUnavailableError(uri) {
    if (uri) markPlaylistUnavailable(uri);
    const err = new Error(MixAppI18n.t("notify.playlistUnavailable"));
    err.code = "PLAYLIST_UNAVAILABLE";
    return err;
  }

  function isPlaylistUnavailableError(err) {
    return (
      err?.code === "PLAYLIST_UNAVAILABLE" ||
      /no longer available/i.test(String(err?.message || ""))
    );
  }

  /**
   * Same extension Spotify’s playlist Key/BPM columns request
   * (AudioAttributesV2 → camelotKey / bpm on each item).
   */
  const TRACK_EXT_AUDIO_ATTRIBUTES_V2 = 222;

  function playlistContentsOptions() {
    return { trackExtensions: [TRACK_EXT_AUDIO_ATTRIBUTES_V2] };
  }

  /**
   * Platform PlaylistAPI.getContents — preferred (keeps item uids / mixing attrs).
   * "Invalid playlist response" usually means deleted/private — do not retry into 429.
   * @returns {{ kind: 'ok', tracks: object[] } | { kind: 'unavailable' } | { kind: 'miss' }}
   */
  async function getPlaylistTracksViaPlatform(uri) {
    const PlaylistAPI = Spicetify?.Platform?.PlaylistAPI;
    if (!PlaylistAPI?.getContents) return { kind: "miss" };

    const opts = playlistContentsOptions();
    let sawInvalid = false;
    let lastErr = null;

    async function tryGetContents(candidate, useOpts) {
      try {
        const contents = useOpts
          ? await PlaylistAPI.getContents(candidate, useOpts)
          : await PlaylistAPI.getContents(candidate);
        if (contents && Array.isArray(contents.items)) {
          return { kind: "ok", tracks: mapPlatformContents(contents) };
        }
      } catch (err) {
        lastErr = err;
        if (isInvalidPlaylistResponse(err)) {
          sawInvalid = true;
          return { kind: "invalid" };
        }
        if (MixAppHttp.isRateLimitError(err)) {
          await MixAppHttp.sleep(1000);
          try {
            const contents = useOpts
              ? await PlaylistAPI.getContents(candidate, useOpts)
              : await PlaylistAPI.getContents(candidate);
            if (contents && Array.isArray(contents.items)) {
              return { kind: "ok", tracks: mapPlatformContents(contents) };
            }
          } catch (err2) {
            lastErr = err2;
            if (isInvalidPlaylistResponse(err2)) {
              sawInvalid = true;
              return { kind: "invalid" };
            }
          }
        }
      }
      return { kind: "miss" };
    }

    for (const candidate of playlistUriCandidates(uri)) {
      let result = await tryGetContents(candidate, opts);
      if (result.kind === "ok") return result;
      // Older clients may reject trackExtensions — retry plain getContents.
      if (result.kind === "miss" && opts) {
        result = await tryGetContents(candidate, null);
        if (result.kind === "ok") return result;
      }
    }
    if (lastErr) {
      console.warn("Weave: PlaylistAPI.getContents failed", lastErr);
    }
    return sawInvalid ? { kind: "unavailable" } : { kind: "miss" };
  }

  function mapGraphqlPlaylistItem(entry, index) {
    const data =
      entry?.itemV2?.data ||
      entry?.item?.data ||
      entry?.data ||
      entry?.track ||
      null;
    if (!data) return null;
    const typename = String(
      data.__typename || entry?.itemV2?.__typename || ""
    );
    if (typename && /NotFound|Episode|Audiobook|Podcast/i.test(typename)) {
      return null;
    }
    const uri = data.uri || "";
    if (uri && !String(uri).includes(":track:")) return null;

    const track = MixAppTrack.fromGraphqlTrack(data, index);
    if (!track) return null;
    if (entry?.uid) track.uid = String(entry.uid);
    const added =
      entry?.addedAt?.isoString ||
      entry?.addedAt ||
      data?.addedAt ||
      null;
    if (added) track.addedAt = added;
    return track;
  }

  function graphqlPlaylistLooksUnavailable(res) {
    const root = res?.data?.playlistV2 ?? res?.data?.playlist ?? res?.playlistV2;
    if (root == null) return true;
    const typename = String(root.__typename || "");
    if (/NotFound|PlaylistNotFound|GenericError/i.test(typename)) return true;
    if (Array.isArray(res?.errors) && res.errors.length) {
      const blob = res.errors.map((e) => e?.message || "").join(" ");
      if (/not.?found|does not exist|404|unavailable|private/i.test(blob)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Pathfinder FetchPlaylistContents — avoids rate-limited Web API /items.
   * @returns {{ kind: 'ok', tracks: object[] } | { kind: 'unavailable' } | { kind: 'miss' }}
   */
  async function getPlaylistTracksViaGraphQL(uri) {
    const GQL = Spicetify?.GraphQL;
    const defs = GQL?.Definitions;
    if (!GQL?.Request || !defs) return { kind: "miss" };

    const definition =
      defs.fetchPlaylistContents ||
      defs.FetchPlaylistContents ||
      defs.fetchPlaylist ||
      defs.FetchPlaylist ||
      null;
    if (!definition) return { kind: "miss" };

    const playlistUri =
      playlistUriCandidates(uri).find((u) => u.includes(":playlist:")) || uri;
    const tracks = [];
    const limit = 100;
    let offset = 0;
    let total = null;

    for (let page = 0; page < 100; page++) {
      let res;
      try {
        res = await GQL.Request(definition, {
          uri: playlistUri,
          offset,
          limit,
          enableWatchFeedEntrypoint: false,
        });
      } catch (err) {
        console.warn("Weave: GraphQL playlist contents failed", err);
        return tracks.length
          ? { kind: "ok", tracks }
          : { kind: "miss" };
      }

      if (page === 0 && graphqlPlaylistLooksUnavailable(res)) {
        return { kind: "unavailable" };
      }
      if (res?.errors?.length && !tracks.length) {
        console.warn("Weave: GraphQL playlist contents errors", res.errors);
        return { kind: "miss" };
      }

      const root = res?.data?.playlistV2 || res?.data?.playlist || res?.playlistV2;
      const content = root?.content || null;
      const items = content?.items;
      if (!Array.isArray(items)) {
        return tracks.length
          ? { kind: "ok", tracks }
          : { kind: "unavailable" };
      }
      if (total == null && content?.totalCount != null) {
        total = Number(content.totalCount);
      }

      for (const entry of items) {
        const track = mapGraphqlPlaylistItem(entry, tracks.length);
        if (track) tracks.push(track);
      }

      offset += items.length;
      if (!items.length || items.length < limit) break;
      if (total != null && offset >= total) break;
      await MixAppHttp.sleep(120);
    }

    return { kind: "ok", tracks };
  }

  async function getPlaylistTracksViaWebApi(uri) {
    const id = MixAppHttp.playlistIdFromUri(uri);
    if (!id) throw new Error("Invalid playlist URI");
    const tracks = [];
    // Feb 2026: /tracks removed — use /items
    let url = `https://api.spotify.com/v1/playlists/${id}/items?limit=100`;
    let index = 0;
    while (url) {
      const page = await MixAppHttp.cosmosGet(url, {
        retries: 3,
        label: "playlist items",
      });
      for (const row of page?.items || []) {
        const track = row?.item || row?.track;
        if (!track || track.is_local) continue;
        if (track.type && track.type !== "track") continue;
        tracks.push(normalizeTrack(row, index++));
      }
      url = page?.next || null;
      if (url) await MixAppHttp.sleep(250);
    }
    return tracks;
  }

  async function getPlaylistTracks(uri) {
    const platform = await getPlaylistTracksViaPlatform(uri);
    if (platform.kind === "ok") return platform.tracks;

    const graphql = await getPlaylistTracksViaGraphQL(uri);
    if (graphql.kind === "ok") return graphql.tracks;

    // Deleted / private: Platform "Invalid playlist response" + GraphQL NotFound.
    // Do not hammer Web API — that only burns rate limit.
    if (platform.kind === "unavailable" || graphql.kind === "unavailable") {
      throw playlistUnavailableError(uri);
    }

    try {
      return await getPlaylistTracksViaWebApi(uri);
    } catch (err) {
      if (
        MixAppHttp.isNotFoundError(err) ||
        MixAppHttp.isForbiddenError(err)
      ) {
        throw playlistUnavailableError(uri);
      }
      throw err;
    }
  }

  /** Synthetic Weave uids — not Spotify playlist-item uids (mixing attrs live on those). */
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
    if (!PlaylistAPI?.getContents) {
      throw new Error(
        "PlaylistAPI.getContents unavailable; cannot sync without replacing"
      );
    }
    let sawInvalid = false;
    let lastErr = null;
    for (const candidate of playlistUriCandidates(uri)) {
      try {
        const contents = await PlaylistAPI.getContents(candidate);
        return (contents?.items || []).map(liveItemFromRaw).filter(Boolean);
      } catch (err) {
        lastErr = err;
        if (isInvalidPlaylistResponse(err)) {
          sawInvalid = true;
          continue;
        }
      }
    }
    if (sawInvalid) throw playlistUnavailableError(uri);
    if (lastErr) throw lastErr;
    throw new Error(
      "PlaylistAPI.getContents unavailable; cannot sync without replacing"
    );
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
    const res = await MixAppHttp.withRetry(
      () =>
        MixAppHttp.cosmosPut(
          `https://api.spotify.com/v1/playlists/${playlistId}/items`,
          body
        ),
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
          await PlaylistAPI.move(playlistUri, [{ uri: item.uri, uid: item.uid }], {
            after: "end",
          });
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
      console.warn("Weave: PlaylistAPI.move reorder failed", err);
      return false;
    }
  }

  /** Web API fallback: same move-to-end strategy, with 429 retries + spacing. */
  async function reorderViaWebApi(playlistUri, targetUids) {
    const id = MixAppHttp.playlistIdFromUri(playlistUri);
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
        await MixAppHttp.sleep(200);
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
    if (
      sameUidOrder(
        live.map((l) => l.uid),
        targetUids
      )
    )
      return;
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

  function playlistUriFromCreateResult(created) {
    if (!created) return null;
    if (typeof created === "string") {
      return created.includes(":playlist:") ? created : null;
    }
    return (
      created.uri ||
      created.playlistUri ||
      created.playlist?.uri ||
      created.metadata?.uri ||
      null
    );
  }

  /** Fill a new playlist — Platform add preferred (avoids Web API 429). */
  async function fillNewPlaylist(uri, trackUris) {
    const uris = (trackUris || []).filter(Boolean);
    if (!uris.length) return;
    const PlaylistAPI = Spicetify?.Platform?.PlaylistAPI;
    if (typeof PlaylistAPI?.add === "function") {
      await playlistApiAdd(uri, uris, { after: "end" });
      return;
    }
    await replacePlaylistTracks(uri, uris);
  }

  /** Full replace via Web API — last resort for brand-new playlists. */
  async function replacePlaylistTracks(uri, trackUris) {
    const id = MixAppHttp.playlistIdFromUri(uri);
    if (!id) throw new Error("Invalid playlist URI");
    const chunkSize = 100;
    for (let i = 0; i < Math.max(trackUris.length, 1); i += chunkSize) {
      const chunk = trackUris.slice(i, i + chunkSize);
      if (i === 0) {
        await MixAppHttp.cosmosPut(
          `https://api.spotify.com/v1/playlists/${id}/items`,
          { uris: chunk },
          { retries: 3, label: "playlist replace" }
        );
      } else if (chunk.length) {
        await MixAppHttp.cosmosPost(
          `https://api.spotify.com/v1/playlists/${id}/items`,
          { uris: chunk },
          { retries: 3, label: "playlist append" }
        );
      }
    }
  }

  async function createPlaylist(name, trackUris) {
    const RootlistAPI = Spicetify?.Platform?.RootlistAPI;
    let uri = null;
    let platformErr = null;

    if (typeof RootlistAPI?.createPlaylist === "function") {
      const attempts = [
        () => RootlistAPI.createPlaylist(name, { before: "start" }),
        () => RootlistAPI.createPlaylist(name, { after: "end" }),
        () => RootlistAPI.createPlaylist(name),
      ];
      for (const attempt of attempts) {
        try {
          const created = await attempt();
          uri = playlistUriFromCreateResult(created);
          if (uri) break;
        } catch (err) {
          platformErr = err;
          console.warn("Weave: RootlistAPI.createPlaylist failed", err);
        }
      }
    }

    if (!uri) {
      try {
        const created = await MixAppHttp.cosmosPost(
          "https://api.spotify.com/v1/me/playlists",
          { name, public: false },
          { retries: 2, label: "create playlist", notifyUser: true }
        );
        uri = playlistUriFromCreateResult(created);
      } catch (err) {
        if (MixAppHttp.isRateLimitError(err) || platformErr) {
          throw new Error(MixAppI18n.t("notify.rateLimit"));
        }
        throw err;
      }
    }

    if (!uri) throw new Error("Failed to create playlist");
    if (trackUris?.length) {
      try {
        await fillNewPlaylist(uri, trackUris);
      } catch (err) {
        console.warn("Weave: failed to fill new playlist", err);
        if (MixAppHttp.isRateLimitError(err)) {
          MixAppNotify.notify(MixAppI18n.t("notify.fillPlaylistFailed"), true);
          return uri;
        }
        throw err;
      }
    }
    return uri;
  }

  async function saveOverwrite(uri, tracks) {
    return syncPlaylistTracks(uri, tracks);
  }

  return {
    listPlaylists,
    getPlaylistMeta,
    getPlaylistTracks,
    getCurrentUserId,
    createPlaylist,
    saveOverwrite,
    syncPlaylistTracks,
    normalizeTrack,
    isPlaylistUnavailableError,
    markPlaylistUnavailable,
    isLibraryPlaylistUnavailable,
  };
})();
