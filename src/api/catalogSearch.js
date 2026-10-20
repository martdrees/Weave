//@ts-check
/**
 * Catalog search: client GraphQL preferred, Web API fallback.
 */

const MixAppCatalogSearch = (() => {
  function normalizeCatalogTrack(raw, index) {
    return MixAppTrack.fromWebApiTrack(raw, index);
  }

  function normalizeGraphqlTrack(data, index) {
    return MixAppTrack.fromGraphqlTrack(data, index);
  }

  function graphqlEntity(entry) {
    return (
      entry?.item?.data || entry?.itemV2?.data || entry?.data || entry?.item || entry
    );
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
      data.content?.totalCount ?? data.tracks?.totalCount ?? data.tracks?.total ?? null;
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
      const res = await MixAppHttp.cosmosGet(url, {
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
      const res = await MixAppHttp.cosmosGet(url, {
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
    searchTracks,
    searchPlaylists,
    normalizeCatalogTrack,
    normalizeGraphqlTrack,
  };
})();
