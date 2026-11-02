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

  function pickImageUrl(sources) {
    if (!Array.isArray(sources) || !sources.length) return null;
    // Prefer a mid-size source when width is present; else last (often largest).
    const withUrl = sources.filter((s) => s && (s.url || s.uri));
    if (!withUrl.length) return null;
    const ranked = withUrl
      .map((s) => ({
        url: s.url || s.uri,
        w: Number(s.width) || Number(s.maxWidth) || 0,
      }))
      .sort((a, b) => a.w - b.w);
    const mid = ranked.find((s) => s.w >= 64) || ranked[ranked.length - 1];
    return mid?.url || null;
  }

  function normalizeGraphqlArtist(data) {
    if (!data?.uri || !String(data.uri).includes(":artist:")) return null;
    const id = data.id || String(data.uri).split(":").pop() || null;
    const imageUrl =
      pickImageUrl(data.visuals?.avatarImage?.sources) ||
      pickImageUrl(data.avatarImage?.sources) ||
      pickImageUrl(data.images) ||
      pickImageUrl(data.avatar?.sources) ||
      null;
    const followers =
      data.stats?.followers ??
      data.followers?.total ??
      data.stats?.monthlyListeners ??
      null;
    return {
      uri: data.uri,
      id,
      name: data.name || data.profile?.name || "Unknown",
      imageUrl,
      followers:
        followers != null && Number.isFinite(Number(followers))
          ? Number(followers)
          : null,
    };
  }

  function userMarket() {
    return (
      Spicetify?.Platform?.Session?.country ||
      Spicetify?.Platform?.PlatformData?.country ||
      "US"
    );
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
   * Case-insensitive substring match on track title (Add Track Songs mode).
   * @param {string|null|undefined} name
   * @param {string} query
   */
  function trackNameMatchesQuery(name, query) {
    const q = String(query || "")
      .trim()
      .toLowerCase();
    if (!q) return false;
    return String(name || "")
      .toLowerCase()
      .includes(q);
  }

  /**
   * Pull track entities from a searchV2 payload.
   * Songs mode prefers tracksV2/tracks only — topResults are mixed entity types
   * and make short queries look empty or randomly sparse.
   * @param {object} searchV2
   * @param {number} want
   * @param {{ allowTopResults?: boolean }} [opts]
   */
  function tracksFromSearchV2(searchV2, want, opts = {}) {
    let entities = collectGraphqlItems(searchV2, ["tracksV2", "tracks"]);
    if (!entities.length && opts.allowTopResults) {
      entities = collectGraphqlItems(searchV2, ["topResultsV2", "topResults"]);
    }
    const out = [];
    const seen = new Set();
    for (const data of entities) {
      const track = normalizeGraphqlTrack(data, out.length);
      if (!track?.uri || seen.has(track.uri)) continue;
      seen.add(track.uri);
      out.push(track);
      if (out.length >= want) break;
    }
    return out;
  }

  function filterTracksByNameQuery(tracks, query, want) {
    const out = [];
    for (const track of tracks || []) {
      if (!trackNameMatchesQuery(track?.name, query)) continue;
      out.push(track);
      if (out.length >= want) break;
    }
    return out;
  }

  /**
   * Artists from searchV2 — prefer artistsV2/artists (not topResults mixture).
   * @param {object} searchV2
   * @param {number} want
   * @param {{ allowTopResults?: boolean }} [opts]
   */
  function artistsFromSearchV2(searchV2, want, opts = {}) {
    let entities = collectGraphqlItems(searchV2, ["artistsV2", "artists"]);
    if (!entities.length && opts.allowTopResults) {
      entities = collectGraphqlItems(searchV2, ["topResultsV2", "topResults"]);
    }
    const out = [];
    const seen = new Set();
    for (const data of entities) {
      const artist = normalizeGraphqlArtist(data);
      if (!artist?.uri || seen.has(artist.uri)) continue;
      seen.add(artist.uri);
      out.push(artist);
      if (out.length >= want) break;
    }
    return out;
  }

  function filterArtistsByNameQuery(artists, query, want) {
    const out = [];
    for (const artist of artists || []) {
      if (!trackNameMatchesQuery(artist?.name, query)) continue;
      out.push(artist);
      if (out.length >= want) break;
    }
    return out;
  }

  /**
   * Persisted-query hashes from xpui-routes-search.js (Spotify category search).
   * These ops are only registered on Definitions after the Search route loads —
   * Weave synthesizes them so we never hit Web API /v1/search (desktop 429).
   * Re-extract hashes if Pathfinder starts rejecting after a Spotify update.
   */
  const SEARCH_TRACKS_HASH =
    "59ee4a659c32e9ad894a71308207594a65ba67bb6b632b183abe97303a51fa55";
  const SEARCH_ARTISTS_HASH =
    "270905851ba5c7faca81cfe053c2dbd8ceb4f156a0e0ef4b385af75ab69ffd13";
  const SEARCH_PLAYLISTS_HASH =
    "d520014e748f9ea44f7707d8df1819867ac1205e8b7f3e28f22fe5fc858921b1";
  const SEARCH_DESKTOP_HASH =
    "db61238974d27839a136c9dc02bfdbe3fab7635f21cf85976ebff9a1ee281345";

  /** Shared variables for getSearchCategoryResults-style Pathfinder ops. */
  function categorySearchVars(query, limit, extras = {}) {
    return {
      searchTerm: query,
      offset: 0,
      limit,
      numberOfTopResults: Math.min(limit, 20),
      includeAudiobooks: false,
      includePreReleases: false,
      includeAlbumPreReleases: false,
      includeArtistHasConcertsField: false,
      ...extras,
    };
  }

  /**
   * Resolve a Pathfinder definition: live Spicetify registry, else synthetic
   * `{ name, operation, sha256Hash }` (same shape as Spotify’s GraphQLLoader).
   * @param {string} name
   * @param {string|null} fallbackHash
   */
  function resolveGraphqlDefinition(name, fallbackHash) {
    const GQL = Spicetify?.GraphQL;
    const live = GQL?.Definitions?.[name] || GQL?.QueryDefinitions?.[name] || null;
    if (live) return live;
    if (!fallbackHash) return null;
    return {
      name,
      operation: "query",
      sha256Hash: fallbackHash,
      value: null,
    };
  }

  /**
   * Client Pathfinder only — never api.spotify.com/v1/search (desktop token 429).
   * @param {string} query
   * @param {number} limit
   * @param {"tracks"|"artists"|"playlists"|"mixed"} [kind]
   */
  async function graphqlSearchV2All(query, limit, kind = "tracks") {
    const GQL = Spicetify?.GraphQL;
    if (!GQL?.Request) return [];

    /** @type {Array<[object, object]>} */
    const attempts = [];
    const base = categorySearchVars(query, limit);

    if (kind === "tracks") {
      const searchTracksDef = resolveGraphqlDefinition(
        "searchTracks",
        SEARCH_TRACKS_HASH
      );
      if (searchTracksDef) attempts.push([searchTracksDef, base]);
      const searchDesktopDef = resolveGraphqlDefinition(
        "searchDesktop",
        SEARCH_DESKTOP_HASH
      );
      if (searchDesktopDef) {
        attempts.push([
          searchDesktopDef,
          categorySearchVars(query, limit, { includePreReleases: true }),
        ]);
      }
    } else if (kind === "artists") {
      const searchArtistsDef = resolveGraphqlDefinition(
        "searchArtists",
        SEARCH_ARTISTS_HASH
      );
      if (searchArtistsDef) attempts.push([searchArtistsDef, base]);
      const searchDesktopDef = resolveGraphqlDefinition(
        "searchDesktop",
        SEARCH_DESKTOP_HASH
      );
      if (searchDesktopDef) {
        attempts.push([
          searchDesktopDef,
          categorySearchVars(query, limit, { includePreReleases: true }),
        ]);
      }
    } else if (kind === "playlists") {
      const searchPlaylistsDef = resolveGraphqlDefinition(
        "searchPlaylists",
        SEARCH_PLAYLISTS_HASH
      );
      if (searchPlaylistsDef) attempts.push([searchPlaylistsDef, base]);
      const searchDesktopDef = resolveGraphqlDefinition(
        "searchDesktop",
        SEARCH_DESKTOP_HASH
      );
      if (searchDesktopDef) {
        attempts.push([
          searchDesktopDef,
          categorySearchVars(query, limit, { includePreReleases: true }),
        ]);
      }
    } else {
      const searchDesktopDef = resolveGraphqlDefinition(
        "searchDesktop",
        SEARCH_DESKTOP_HASH
      );
      if (searchDesktopDef) {
        attempts.push([
          searchDesktopDef,
          categorySearchVars(query, limit, { includePreReleases: true }),
        ]);
      }
      const modal = resolveGraphqlDefinition("searchModalResults", null);
      if (modal) {
        attempts.push([
          modal,
          categorySearchVars(query, limit, {
            includeAuthors: false,
            includePreRelease: true,
          }),
        ]);
      }
    }

    const results = [];
    for (const [definition, variables] of attempts) {
      try {
        const res = await GQL.Request(definition, variables);
        if (res?.errors?.length) {
          console.warn(
            "Weave GraphQL search errors",
            definition?.name || "?",
            res.errors
          );
          continue;
        }
        const searchV2 = res?.data?.searchV2 || res?.searchV2;
        if (searchV2) results.push(searchV2);
      } catch (err) {
        console.warn(
          "Weave GraphQL search attempt failed",
          definition?.name || "?",
          err
        );
      }
    }
    return results;
  }

  /**
   * Catalog track search via client Pathfinder only (searchTracks / searchDesktop).
   * Keeps tracks whose **name** contains the query.
   * Never calls api.spotify.com/v1/search — desktop tokens 429 and poison writes.
   */
  async function searchTracks(query, opts = {}) {
    const q = String(query || "").trim();
    if (!q) return [];
    const want = Math.min(50, Math.max(1, Number(opts.limit) || 20));
    // Fetch extra before title filter (Spotify also matches artist/album).
    const fetchLimit = Math.min(50, Math.max(want * 2, want));

    if (!Spicetify?.GraphQL?.Request) {
      throw new Error(
        "Catalog search unavailable (GraphQL not ready). Re-open Weave and try again."
      );
    }

    const payloads = await graphqlSearchV2All(q, fetchLimit, "tracks");
    if (!payloads.length) {
      throw new Error(
        "Catalog search unavailable (Pathfinder track search failed). Try again in a moment."
      );
    }

    /** @type {MixAppTrackRow[]} */
    let best = [];
    for (const searchV2 of payloads) {
      const tracks = tracksFromSearchV2(searchV2, fetchLimit, {
        allowTopResults: false,
      });
      const named = filterTracksByNameQuery(tracks, q, want);
      if (named.length > best.length) best = named;
      if (best.length >= want) break;
    }
    return best;
  }

  async function searchPlaylists(query, opts = {}) {
    const q = String(query || "").trim();
    if (!q) return [];
    const want = Math.min(30, Math.max(1, Number(opts.limit) || 15));

    if (!Spicetify?.GraphQL?.Request) {
      throw new Error(
        "Playlist search unavailable (GraphQL not ready). Re-open Weave and try again."
      );
    }

    const payloads = await graphqlSearchV2All(q, want, "playlists");
    if (!payloads.length) {
      throw new Error(
        "Playlist search unavailable (Pathfinder playlist search failed). Try again in a moment."
      );
    }

    const out = [];
    const seen = new Set();
    for (const searchV2 of payloads) {
      let entities = collectGraphqlItems(searchV2, ["playlistsV2", "playlists"]);
      for (const data of entities) {
        const pl = normalizeGraphqlPlaylist(data);
        if (!pl?.uri || seen.has(pl.uri)) continue;
        seen.add(pl.uri);
        out.push(pl);
        if (out.length >= want) return out;
      }
    }
    return out;
  }

  /**
   * Artist catalog search via Pathfinder searchArtists (Spotify Artists tab).
   * Keeps artists whose **name** contains the query. Never /v1/search.
   * @returns {Promise<object[]>}
   */
  async function searchArtists(query, opts = {}) {
    const q = String(query || "").trim();
    if (!q) return [];
    const want = Math.min(40, Math.max(1, Number(opts.limit) || 20));
    const fetchLimit = Math.min(50, Math.max(want * 2, want));

    if (!Spicetify?.GraphQL?.Request) {
      throw new Error(
        "Artist search unavailable (GraphQL not ready). Re-open Weave and try again."
      );
    }

    const payloads = await graphqlSearchV2All(q, fetchLimit, "artists");
    if (!payloads.length) {
      throw new Error(
        "Artist search unavailable (Pathfinder artist search failed). Try again in a moment."
      );
    }

    /** @type {object[]} */
    let best = [];
    for (const searchV2 of payloads) {
      const artists = artistsFromSearchV2(searchV2, fetchLimit, {
        allowTopResults: false,
      });
      const named = filterArtistsByNameQuery(artists, q, want);
      if (named.length > best.length) best = named;
      if (best.length >= want) break;
    }
    return best;
  }

  function artistUriFrom(idOrUri) {
    const raw = String(idOrUri || "").trim();
    if (!raw) return null;
    if (raw.includes(":artist:")) return raw;
    return "spotify:artist:" + raw;
  }

  function artistIdFrom(idOrUri) {
    const uri = artistUriFrom(idOrUri);
    return uri ? uri.split(":").pop() : null;
  }

  /** Pull track-like nodes from queryArtistOverview (shape varies by client). */
  function tracksFromArtistOverview(res) {
    const artist =
      res?.data?.artistUnion ||
      res?.data?.artist ||
      res?.artistUnion ||
      res?.artist ||
      null;
    if (!artist) return [];

    const buckets = [
      artist.discography?.topTracks?.items,
      artist.discography?.topTracks?.tracks,
      artist.relatedContent?.topTracks?.items,
      artist.stats?.topTracks?.items,
      artist.topTracks?.items,
      artist.discography?.popularReleasesTracks?.items,
    ];

    const out = [];
    const seen = new Set();
    for (const items of buckets) {
      if (!Array.isArray(items)) continue;
      for (let i = 0; i < items.length; i++) {
        const entry = items[i];
        const raw =
          entry?.track ||
          entry?.item?.data ||
          entry?.itemV2?.data ||
          entry?.data ||
          entry?.item ||
          entry;
        if (!raw) continue;
        let track = normalizeGraphqlTrack(raw, out.length);
        if (!track?.uri && raw?.uri && String(raw.uri).includes(":track:")) {
          track = normalizeGraphqlTrack(raw, out.length);
        }
        // Some overview rows are thin wrappers with only uri/name.
        if (!track?.uri && raw?.uri && String(raw.uri).includes(":track:")) {
          track = MixAppTrack.fromWebApiTrack(
            {
              uri: raw.uri,
              id: raw.id || String(raw.uri).split(":").pop(),
              name: raw.name || "Unknown",
              artists: raw.artists || [],
              album: raw.album || {},
              duration_ms: raw.duration_ms || raw.durationMs || 0,
              explicit: !!raw.explicit,
            },
            out.length
          );
        }
        if (!track?.uri || seen.has(track.uri)) continue;
        seen.add(track.uri);
        out.push(track);
      }
      if (out.length) break;
    }
    return out;
  }

  async function getArtistTopTracksViaGraphQL(artistUri, want) {
    const GQL = Spicetify?.GraphQL;
    const defs = GQL?.Definitions;
    if (!GQL?.Request || !defs?.queryArtistOverview) return [];

    const attempts = [
      { uri: artistUri, locale: Spicetify?.Locale?.getLocale?.() || "en" },
      { uri: artistUri },
      {
        uri: artistUri,
        locale: "en",
        includePrerelease: false,
      },
    ];

    for (const variables of attempts) {
      try {
        const res = await GQL.Request(defs.queryArtistOverview, variables);
        if (res?.errors?.length) {
          console.warn("Weave: queryArtistOverview errors", res.errors);
          continue;
        }
        const tracks = tracksFromArtistOverview(res);
        if (tracks.length) return tracks.slice(0, want);
      } catch (err) {
        console.warn("Weave: queryArtistOverview failed", err);
      }
    }
    return [];
  }

  /**
   * Artist Song Radio playlist via inspiredby-mix (client endpoint — avoids Web API 429).
   */
  async function getArtistTracksViaRadio(artistId, want) {
    if (!artistId || typeof MixAppPlaylists?.getPlaylistTracks !== "function") {
      return [];
    }
    const urls = [
      "https://spclient.wg.spotify.com/inspiredby-mix/v2/seed_to_playlist/spotify:artist:" +
        artistId +
        "?response-format=json",
      "https://api.spotify.com/v1/inspiredby-mix/v2/seed_to_playlist/spotify:artist:" +
        artistId +
        "?response-format=json",
    ];
    let playlistUri = null;
    for (const url of urls) {
      try {
        const res = await MixAppHttp.cosmosGet(url, {
          retries: 1,
          label: "artist-radio",
          notifyUser: false,
        });
        const items = res?.mediaItems || res?.media_items || res?.items || [];
        const uri =
          (Array.isArray(items) && items[0]?.uri) ||
          res?.uri ||
          res?.playlist?.uri ||
          null;
        if (uri && String(uri).includes("playlist")) {
          playlistUri = uri;
          break;
        }
      } catch (err) {
        console.warn("Weave: artist radio resolve failed", err);
      }
    }
    if (!playlistUri) return [];
    try {
      const tracks = await MixAppPlaylists.getPlaylistTracks(playlistUri);
      return (tracks || []).slice(0, want);
    } catch (err) {
      console.warn("Weave: artist radio playlist load failed", err);
      return [];
    }
  }

  /** Last resort — often 429 under desktop client tokens. */
  async function getArtistTopTracksViaWebApi(artistId, market, want) {
    const url =
      "https://api.spotify.com/v1/artists/" +
      encodeURIComponent(artistId) +
      "/top-tracks?market=" +
      encodeURIComponent(market || "US");
    const res = await MixAppHttp.cosmosGet(url, {
      retries: 2,
      label: "artist top-tracks",
      notifyUser: false,
    });
    const items = res?.tracks || [];
    const out = [];
    const seen = new Set();
    for (let i = 0; i < items.length; i++) {
      const track = normalizeCatalogTrack(items[i], i);
      if (!track?.uri || seen.has(track.uri)) continue;
      seen.add(track.uri);
      out.push(track);
      if (out.length >= want) break;
    }
    return out;
  }

  /**
   * Popular / representative tracks for an artist.
   * Prefers client GraphQL + artist radio; Web API top-tracks is last resort (429-prone).
   * @param {string} artistIdOrUri
   * @param {object} [opts]
   * @returns {Promise<MixAppTrackRow[]>}
   */
  async function getArtistTopTracks(artistIdOrUri, opts = {}) {
    const uri = artistUriFrom(artistIdOrUri);
    const id = artistIdFrom(artistIdOrUri);
    if (!uri || !id) return [];
    const want = Math.min(50, Math.max(1, Number(opts.limit) || 20));

    const fromGql = await getArtistTopTracksViaGraphQL(uri, want);
    if (fromGql.length) return fromGql;

    const fromRadio = await getArtistTracksViaRadio(id, want);
    if (fromRadio.length) return fromRadio;

    try {
      return await getArtistTopTracksViaWebApi(id, opts.market || userMarket(), want);
    } catch (err) {
      console.error("Weave: artist tracks unavailable", err);
      if (MixAppHttp?.isRateLimitError?.(err)) {
        throw new Error("Artist tracks rate-limited — wait a moment and try again");
      }
      throw new Error(
        "Could not load artist tracks (client search blocked). Try again in a moment."
      );
    }
  }

  function albumUriFrom(idOrUri) {
    const raw = String(idOrUri || "").trim();
    if (!raw) return null;
    if (raw.includes(":album:")) return raw;
    return "spotify:album:" + raw;
  }

  function normalizeAlbum(raw, group) {
    if (!raw) return null;
    const uri = raw.uri || (raw.id ? "spotify:album:" + raw.id : null);
    if (!uri || !String(uri).includes(":album:")) return null;
    const id = raw.id || String(uri).split(":").pop();
    const imageUrl =
      pickImageUrl(raw.coverArt?.sources) ||
      pickImageUrl(raw.images) ||
      pickImageUrl(raw.visualIdentity?.image?.[0]?.sources) ||
      null;
    const year =
      yearFromReleaseDate(raw.date?.isoString || raw.date?.year || raw.release_date) ??
      (raw.date?.year != null && Number.isFinite(Number(raw.date.year))
        ? Number(raw.date.year)
        : null);
    const totalTracks =
      raw.tracks?.totalCount ??
      raw.tracks?.total ??
      raw.totalTracks ??
      raw.total_tracks ??
      null;
    return {
      uri,
      id,
      name: raw.name || "Album",
      imageUrl,
      year: Number.isFinite(Number(year)) ? Number(year) : null,
      totalTracks:
        totalTracks != null && Number.isFinite(Number(totalTracks))
          ? Number(totalTracks)
          : null,
      group: group || raw.album_type || raw.type || "album",
    };
  }

  function yearFromReleaseDate(dateStr) {
    if (dateStr == null || dateStr === "") return null;
    const y = parseInt(String(dateStr).slice(0, 4), 10);
    return Number.isFinite(y) ? y : null;
  }

  function collectDiscographyAlbums(res, group) {
    const artist =
      res?.data?.artistUnion ||
      res?.data?.artist ||
      res?.artistUnion ||
      res?.artist ||
      null;
    const section =
      artist?.discography?.[group] ||
      artist?.discography?.albums ||
      artist?.discography?.singles ||
      null;
    const items = section?.items || section?.releases || [];
    if (!Array.isArray(items)) return [];
    const out = [];
    const seen = new Set();
    for (const entry of items) {
      // Discography rows often wrap releases.items[0]
      const releases = entry?.releases?.items || entry?.releases || [];
      const candidates =
        Array.isArray(releases) && releases.length
          ? releases
          : [entry?.data || entry?.release || entry];
      for (const raw of candidates) {
        const album = normalizeAlbum(raw, group);
        if (!album?.uri || seen.has(album.uri)) continue;
        seen.add(album.uri);
        out.push(album);
      }
    }
    return out;
  }

  async function getArtistAlbumsViaGraphQL(artistUri, want) {
    const GQL = Spicetify?.GraphQL;
    const defs = GQL?.Definitions;
    if (!GQL?.Request || !defs) return [];

    const locale = Spicetify?.Locale?.getLocale?.() || "en";
    const attempts = [];
    if (defs.queryArtistDiscographyAlbums) {
      attempts.push([
        defs.queryArtistDiscographyAlbums,
        { uri: artistUri, offset: 0, limit: want, locale },
        "albums",
      ]);
    }
    if (defs.queryArtistDiscographySingles) {
      attempts.push([
        defs.queryArtistDiscographySingles,
        { uri: artistUri, offset: 0, limit: Math.min(want, 30), locale },
        "singles",
      ]);
    }
    if (defs.queryArtistDiscographyAll) {
      attempts.push([
        defs.queryArtistDiscographyAll,
        { uri: artistUri, offset: 0, limit: want, locale },
        "albums",
      ]);
    }
    if (defs.queryArtistDiscographyOverview) {
      attempts.push([
        defs.queryArtistDiscographyOverview,
        { uri: artistUri, locale },
        "albums",
      ]);
    }

    const out = [];
    const seen = new Set();
    for (const [definition, variables, group] of attempts) {
      try {
        const res = await GQL.Request(definition, variables);
        if (res?.errors?.length) {
          console.warn("Weave: artist discography errors", res.errors);
          continue;
        }
        for (const album of collectDiscographyAlbums(res, group)) {
          if (seen.has(album.uri)) continue;
          seen.add(album.uri);
          out.push(album);
          if (out.length >= want) return out;
        }
      } catch (err) {
        console.warn("Weave: artist discography failed", err);
      }
    }
    return out;
  }

  async function getArtistAlbumsViaWebApi(artistId, want) {
    const out = [];
    const seen = new Set();
    let offset = 0;
    while (out.length < want) {
      const pageSize = Math.min(20, want - out.length);
      const url =
        "https://api.spotify.com/v1/artists/" +
        encodeURIComponent(artistId) +
        "/albums?include_groups=album,single&limit=" +
        pageSize +
        "&offset=" +
        offset +
        "&market=" +
        encodeURIComponent(userMarket());
      const res = await MixAppHttp.cosmosGet(url, {
        retries: 2,
        label: "artist albums",
        notifyUser: false,
      });
      const items = res?.items || [];
      if (!items.length) break;
      for (const raw of items) {
        const album = normalizeAlbum(raw, raw.album_type || "album");
        if (!album?.uri || seen.has(album.uri)) continue;
        seen.add(album.uri);
        out.push(album);
        if (out.length >= want) break;
      }
      offset += items.length;
      if (!res?.next || items.length < pageSize) break;
    }
    return out;
  }

  /**
   * Artist discography albums + singles (GraphQL preferred).
   * @param {string} artistIdOrUri
   * @param {object} [opts]
   * @returns {Promise<object[]>}
   */
  async function getArtistAlbums(artistIdOrUri, opts = {}) {
    const uri = artistUriFrom(artistIdOrUri);
    const id = artistIdFrom(artistIdOrUri);
    if (!uri || !id) return [];
    const want = Math.min(80, Math.max(1, Number(opts.limit) || 40));

    const fromGql = await getArtistAlbumsViaGraphQL(uri, want);
    if (fromGql.length) return fromGql;

    try {
      return await getArtistAlbumsViaWebApi(id, want);
    } catch (err) {
      console.error("Weave: artist albums unavailable", err);
      if (MixAppHttp?.isRateLimitError?.(err)) {
        throw new Error("Artist albums rate-limited — wait a moment and try again");
      }
      throw new Error("Could not load artist albums. Try again in a moment.");
    }
  }

  function tracksFromAlbumGraphql(res) {
    const album =
      res?.data?.albumUnion ||
      res?.data?.album ||
      res?.albumUnion ||
      res?.album ||
      null;
    const items =
      album?.tracksV2?.items || album?.tracks?.items || album?.tracksV2 || [];
    if (!Array.isArray(items)) return [];
    const out = [];
    const seen = new Set();
    for (let i = 0; i < items.length; i++) {
      const entry = items[i];
      const raw =
        entry?.track ||
        entry?.item?.data ||
        entry?.itemV2?.data ||
        entry?.data ||
        entry?.item ||
        entry;
      if (!raw) continue;
      // Album query tracks often omit album name — stamp from parent.
      if (album?.name && !raw.albumOfTrack && !raw.album) {
        raw.albumOfTrack = {
          name: album.name,
          uri: album.uri,
          id: album.id,
          date: album.date,
        };
      }
      const track = normalizeGraphqlTrack(raw, out.length);
      if (!track?.uri || seen.has(track.uri)) continue;
      seen.add(track.uri);
      out.push(track);
    }
    return out;
  }

  async function getAlbumTracksViaGraphQL(albumUri, want) {
    const GQL = Spicetify?.GraphQL;
    const defs = GQL?.Definitions;
    if (!GQL?.Request || !defs) return [];

    const locale = Spicetify?.Locale?.getLocale?.() || "en";
    const attempts = [];
    if (defs.queryAlbumTracks) {
      attempts.push([
        defs.queryAlbumTracks,
        { uri: albumUri, offset: 0, limit: want, locale },
      ]);
    }
    if (defs.getAlbum) {
      attempts.push([defs.getAlbum, { uri: albumUri, locale, offset: 0, limit: want }]);
    }
    if (defs.getAlbumNameAndTracks) {
      attempts.push([
        defs.getAlbumNameAndTracks,
        { uri: albumUri, offset: 0, limit: want },
      ]);
    }

    for (const [definition, variables] of attempts) {
      try {
        const res = await GQL.Request(definition, variables);
        if (res?.errors?.length) {
          console.warn("Weave: album tracks errors", res.errors);
          continue;
        }
        const tracks = tracksFromAlbumGraphql(res);
        if (tracks.length) return tracks.slice(0, want);
      } catch (err) {
        console.warn("Weave: album tracks GraphQL failed", err);
      }
    }
    return [];
  }

  async function getAlbumTracksViaWebApi(albumId, want) {
    const url =
      "https://api.spotify.com/v1/albums/" +
      encodeURIComponent(albumId) +
      "?market=" +
      encodeURIComponent(userMarket());
    const res = await MixAppHttp.cosmosGet(url, {
      retries: 2,
      label: "album tracks",
      notifyUser: false,
    });
    const albumName = res?.name || "";
    const albumUri = res?.uri || null;
    const items = res?.tracks?.items || [];
    const out = [];
    const seen = new Set();
    for (let i = 0; i < items.length && out.length < want; i++) {
      const raw = items[i];
      if (!raw) continue;
      // Thin track objects — attach album for display.
      const track = normalizeCatalogTrack(
        {
          ...raw,
          album: {
            name: albumName,
            uri: albumUri,
            id: albumId,
            release_date: res?.release_date,
          },
        },
        i
      );
      if (!track?.uri || seen.has(track.uri)) continue;
      seen.add(track.uri);
      out.push(track);
    }
    return out;
  }

  /**
   * Tracks on an album (GraphQL preferred).
   * @param {string} albumIdOrUri
   * @param {object} [opts]
   * @returns {Promise<MixAppTrackRow[]>}
   */
  async function getAlbumTracks(albumIdOrUri, opts = {}) {
    const uri = albumUriFrom(albumIdOrUri);
    if (!uri) return [];
    const id = uri.split(":").pop();
    const want = Math.min(100, Math.max(1, Number(opts.limit) || 50));

    const fromGql = await getAlbumTracksViaGraphQL(uri, want);
    if (fromGql.length) return fromGql;

    try {
      return await getAlbumTracksViaWebApi(id, want);
    } catch (err) {
      console.error("Weave: album tracks unavailable", err);
      if (MixAppHttp?.isRateLimitError?.(err)) {
        throw new Error("Album tracks rate-limited — wait a moment and try again");
      }
      throw new Error("Could not load album tracks. Try again in a moment.");
    }
  }

  return {
    searchTracks,
    searchPlaylists,
    searchArtists,
    getArtistTopTracks,
    getArtistAlbums,
    getAlbumTracks,
    normalizeCatalogTrack,
    normalizeGraphqlTrack,
    /** @internal test helpers */
    trackNameMatchesQuery,
    filterTracksByNameQuery,
    filterArtistsByNameQuery,
    tracksFromSearchV2,
    artistsFromSearchV2,
  };
})();
