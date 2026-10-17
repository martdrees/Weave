//@ts-check
/**
 * Playlist list / load / differential sync / create.
 */

const MixAppPlaylists = (() => {
  function normalizeTrack(raw, index) {
    return MixAppTrack.fromPlaylistItem(raw, index);
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
      const page = await MixAppHttp.cosmosGet(url);
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
      const me = await MixAppHttp.cosmosGet("https://api.spotify.com/v1/me");
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

    const id = MixAppHttp.playlistIdFromUri(uri);
    const meta = await MixAppHttp.cosmosGet(`https://api.spotify.com/v1/playlists/${id}`);
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

    const id = MixAppHttp.playlistIdFromUri(uri);
    const tracks = [];
    // Feb 2026: /tracks removed — use /items
    let url = `https://api.spotify.com/v1/playlists/${id}/items?limit=100`;
    let index = 0;
    while (url) {
      const page = await MixAppHttp.cosmosGet(url);
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
    const res = await MixAppHttp.withRetry(
      () =>
        MixAppHttp.cosmosPut(`https://api.spotify.com/v1/playlists/${playlistId}/items`, body),
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
    const id = MixAppHttp.playlistIdFromUri(uri);
    if (!id) throw new Error("Invalid playlist URI");
    const chunkSize = 100;
    for (let i = 0; i < Math.max(trackUris.length, 1); i += chunkSize) {
      const chunk = trackUris.slice(i, i + chunkSize);
      if (i === 0) {
        await MixAppHttp.cosmosPut(`https://api.spotify.com/v1/playlists/${id}/items`, {
          uris: chunk,
        });
      } else if (chunk.length) {
        await MixAppHttp.cosmosPost(`https://api.spotify.com/v1/playlists/${id}/items`, {
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
      const created = await MixAppHttp.cosmosPost("https://api.spotify.com/v1/me/playlists", {
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


  return {
    listPlaylists,
    getPlaylistMeta,
    getPlaylistTracks,
    getCurrentUserId,
    createPlaylist,
    saveOverwrite,
    syncPlaylistTracks,
    normalizeTrack,
  };
})();
