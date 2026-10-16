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
      const page = await Spicetify.CosmosAsync.get(url);
      for (const p of page?.items || []) {
        const isOwnedBySelf = p.owner?.id === me;
        playlists.push({
          uri: p.uri,
          name: p.name || "Untitled",
          collaborative: !!p.collaborative,
          isOwnedBySelf,
          canEdit: isOwnedBySelf || !!p.collaborative,
          totalLength: p.tracks?.total ?? null,
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
      const me = await Spicetify.CosmosAsync.get("https://api.spotify.com/v1/me");
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
    const meta = await Spicetify.CosmosAsync.get(
      `https://api.spotify.com/v1/playlists/${id}`
    );
    const me = await getCurrentUserId();
    return {
      uri: meta.uri || uri,
      name: meta.name || "Playlist",
      description: meta.description || "",
      isOwnedBySelf: meta.owner?.id === me,
      collaborative: !!meta.collaborative,
      totalLength: meta.tracks?.total ?? null,
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
            const t = item?.track || item;
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
    let url = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100`;
    let index = 0;
    while (url) {
      const page = await Spicetify.CosmosAsync.get(url);
      for (const item of page?.items || []) {
        if (!item?.track || item.track.is_local) continue;
        if (item.track.type && item.track.type !== "track") continue;
        tracks.push(normalizeTrack(item, index++));
      }
      url = page?.next || null;
    }
    return tracks;
  }

  async function replacePlaylistTracks(uri, trackUris) {
    const id = playlistIdFromUri(uri);
    const chunkSize = 100;
    for (let i = 0; i < Math.max(trackUris.length, 1); i += chunkSize) {
      const chunk = trackUris.slice(i, i + chunkSize);
      if (i === 0) {
        await Spicetify.CosmosAsync.put(
          `https://api.spotify.com/v1/playlists/${id}/tracks`,
          { uris: chunk }
        );
      } else if (chunk.length) {
        await Spicetify.CosmosAsync.post(
          `https://api.spotify.com/v1/playlists/${id}/tracks`,
          { uris: chunk }
        );
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
      const created = await Spicetify.CosmosAsync.post(
        "https://api.spotify.com/v1/me/playlists",
        { name, public: false }
      );
      uri = created?.uri;
    }

    if (!uri) throw new Error("Failed to create playlist");
    if (trackUris?.length) {
      await replacePlaylistTracks(uri, trackUris);
    }
    return uri;
  }

  async function saveOverwrite(uri, tracks) {
    const uris = tracks.map((t) => t.uri).filter(Boolean);
    await replacePlaylistTracks(uri, uris);
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
  };
})();
