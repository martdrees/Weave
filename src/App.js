//@ts-check

function MixAppPage() {
  const react = Spicetify.React;
  const savedSessionRef = react.useRef(null);
  if (savedSessionRef.current === null) {
    savedSessionRef.current = MixAppSession.load() || false;
  }
  const saved = savedSessionRef.current || null;

  const undoRef = react.useRef(null);
  if (!undoRef.current) {
    undoRef.current = MixAppCreateUndoStack(40);
    if (saved?.undo) undoRef.current.importState(saved.undo);
  }

  const persistTimerRef = react.useRef(null);
  const sessionSnapRef = react.useRef(null);

  const [playlists, setPlaylists] = react.useState([]);
  const [selectedUri, setSelectedUri] = react.useState(
    () => saved?.selectedUri || null
  );
  const [playlist, setPlaylist] = react.useState(() => saved?.playlist || null);
  const [tracks, setTracks] = react.useState(() => {
    const list = Array.isArray(saved?.tracks)
      ? saved.tracks.map((t) => ({ ...t }))
      : [];
    return MixAppFeatures.reformatTrackKeys(list);
  });
  const [listLoading, setListLoading] = react.useState(true);
  const [tracksLoading, setTracksLoading] = react.useState(false);
  const [dirty, setDirty] = react.useState(() => !!saved?.dirty);
  const [saving, setSaving] = react.useState(false);
  const [canUndo, setCanUndo] = react.useState(() =>
    !!(saved?.undo?.past && saved.undo.past.length)
  );
  const [canRedo, setCanRedo] = react.useState(() =>
    !!(saved?.undo?.future && saved.undo.future.length)
  );
  const [error, setError] = react.useState(null);
  const [playingUri, setPlayingUri] = react.useState(null);
  const [isPlaying, setIsPlaying] = react.useState(false);
  const [searchOpen, setSearchOpen] = react.useState(() => !!saved?.searchOpen);
  const [resultsOpen, setResultsOpen] = react.useState(
    () => !!saved?.resultsOpen
  );
  const [statsOpen, setStatsOpen] = react.useState(() => !!saved?.statsOpen);
  const [arrangerFilters, setArrangerFilters] = react.useState(() =>
    saved?.arrangerFilters || MixAppFeatures.defaultArrangerFilters()
  );
  const [seedUris, setSeedUris] = react.useState(() =>
    Array.isArray(saved?.seedUris) ? saved.seedUris : []
  );
  const [searchFeatures, setSearchFeatures] = react.useState(() =>
    saved?.searchFeatures || MixAppRecommend.defaultFeatureState()
  );
  const [searchFilters, setSearchFilters] = react.useState(() => {
    const base = {
      hideExisting: true,
      hideExistingArtists: false,
      excludeExplicit: false,
      excludeAberrant: true,
      yearMin: "",
      yearMax: "",
      camelotMoves: [],
    };
    const savedFilters = saved?.searchFilters || {};
    return {
      ...base,
      ...savedFilters,
      camelotMoves: Array.isArray(savedFilters.camelotMoves)
        ? savedFilters.camelotMoves
        : [],
    };
  });
  const [resultLimit, setResultLimit] = react.useState(
    () => saved?.resultLimit || 100
  );
  const [searchResults, setSearchResults] = react.useState(() =>
    Array.isArray(saved?.searchResults) ? saved.searchResults : []
  );
  const [searchLoading, setSearchLoading] = react.useState(false);
  const [searchFitting, setSearchFitting] = react.useState(false);
  const [searchError, setSearchError] = react.useState(null);
  const [bannedUris, setBannedUris] = react.useState(() =>
    Array.isArray(saved?.bannedUris) ? saved.bannedUris : []
  );

  function syncUndoFlags() {
    setCanUndo(undoRef.current.canUndo());
    setCanRedo(undoRef.current.canRedo());
  }

  function buildSessionSnapshot() {
    return {
      selectedUri,
      playlist,
      tracks,
      dirty,
      seedUris,
      bannedUris,
      searchFeatures,
      searchFilters,
      resultLimit,
      arrangerFilters,
      searchOpen,
      statsOpen,
      resultsOpen,
      searchResults,
      undo: undoRef.current.exportState(),
    };
  }

  function writeSession(snapshot) {
    if (!snapshot?.selectedUri) {
      MixAppSession.clear();
      return;
    }
    MixAppSession.save(snapshot);
  }

  function persistSessionSoon() {
    const snapshot = buildSessionSnapshot();
    sessionSnapRef.current = snapshot;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      writeSession(sessionSnapRef.current);
    }, 250);
  }

  // Keep snap current every render so unmount flush never writes a stale/empty session.
  sessionSnapRef.current = buildSessionSnapshot();

  function syncPlaybackState() {
    const data = Spicetify?.Player?.data;
    const uri = data?.item?.uri || data?.track?.uri || null;
    setPlayingUri(uri || null);
    setIsPlaying(!!Spicetify?.Player?.isPlaying?.());
  }

  async function refreshPlaylists() {
    setListLoading(true);
    setError(null);
    try {
      const items = await MixAppApi.listPlaylists();
      items.sort((a, b) => a.name.localeCompare(b.name));
      setPlaylists(items);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load playlists");
      MixAppApi.notify("Failed to load playlists", true);
    } finally {
      setListLoading(false);
    }
  }

  react.useEffect(() => {
    refreshPlaylists();
  }, []);

  react.useEffect(() => {
    persistSessionSoon();
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [
    selectedUri,
    playlist,
    tracks,
    dirty,
    seedUris,
    bannedUris,
    searchFeatures,
    searchFilters,
    resultLimit,
    arrangerFilters,
    searchOpen,
    statsOpen,
    resultsOpen,
    searchResults,
    canUndo,
    canRedo,
  ]);

  // Flush latest snapshot when the Custom App unmounts (navigate away).
  react.useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      writeSession(sessionSnapRef.current);
    };
  }, []);

  react.useEffect(() => {
    setSeedUris((prev) =>
      prev.filter((uri) => tracks.some((t) => t.uri === uri))
    );
  }, [tracks]);

  react.useEffect(() => {
    syncPlaybackState();
    const player = Spicetify?.Player;
    if (!player?.addEventListener) return undefined;
    const onChange = () => syncPlaybackState();
    player.addEventListener("songchange", onChange);
    player.addEventListener("onplaypause", onChange);
    return () => {
      player.removeEventListener?.("songchange", onChange);
      player.removeEventListener?.("onplaypause", onChange);
    };
  }, []);

  async function loadPlaylist(uri) {
    if (!uri) {
      setSelectedUri(null);
      setPlaylist(null);
      setTracks([]);
      setDirty(false);
      setSeedUris([]);
      setBannedUris([]);
      setSearchResults([]);
      setResultsOpen(false);
      setSearchOpen(false);
      setArrangerFilters(MixAppFeatures.defaultArrangerFilters());
      undoRef.current.clear();
      syncUndoFlags();
      MixAppSession.clear();
      return;
    }

    // Selecting the already-open playlist should not wipe local work.
    if (uri === selectedUri && tracks.length) {
      return;
    }

    setSelectedUri(uri);
    setTracksLoading(true);
    setError(null);
    setSeedUris([]);
    setBannedUris([]);
    setSearchResults([]);
    setResultsOpen(false);
    setArrangerFilters(MixAppFeatures.defaultArrangerFilters());
    try {
      const [meta, items] = await Promise.all([
        MixAppApi.getPlaylistMeta(uri),
        MixAppApi.getPlaylistTracks(uri),
      ]);
      // Enrich ownership from library list when metadata is vague
      const listed = playlists.find((p) => p.uri === uri);
      if (listed) {
        meta.isOwnedBySelf = !!(meta.isOwnedBySelf || listed.isOwnedBySelf);
        meta.collaborative = !!(meta.collaborative || listed.collaborative);
        if (listed.canEdit === false) {
          meta.isOwnedBySelf = false;
          meta.collaborative = false;
        }
      }
      setPlaylist(meta);
      setTracks(items);
      setDirty(false);
      undoRef.current.clear();
      syncUndoFlags();
      setTracksLoading(false);
      // Key / BPM from spclient audio-attributes (Camelot keys)
      try {
        const enriched = await MixAppFeatures.enrichTracks(items.slice());
        setTracks(enriched.slice());
      } catch (featErr) {
        console.warn("MixApp: feature enrich failed", featErr);
      }
      return;
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load playlist");
      MixAppApi.notify("Failed to load playlist", true);
      setPlaylist(null);
      setTracks([]);
    } finally {
      setTracksLoading(false);
    }
  }

  function commitTracks(next, { recordUndo } = { recordUndo: true }) {
    if (recordUndo) {
      undoRef.current.push(tracks);
    }
    setTracks(next);
    setDirty(true);
    syncUndoFlags();
  }

  function handleReorder(from, to) {
    if (from === to) return;
    const next = tracks.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commitTracks(next);
  }

  function handleUndo() {
    const prev = undoRef.current.undo(tracks);
    if (!prev) return;
    setTracks(prev);
    setDirty(true);
    syncUndoFlags();
  }

  function handleRedo() {
    const next = undoRef.current.redo(tracks);
    if (!next) return;
    setTracks(next);
    setDirty(true);
    syncUndoFlags();
  }

  async function handleSave() {
    if (!playlist?.uri || !dirty) return;
    setSaving(true);
    try {
      await MixAppApi.saveOverwrite(playlist.uri, tracks);
      setDirty(false);
      undoRef.current.clear();
      syncUndoFlags();
      MixAppApi.notify("Playlist saved");
    } catch (err) {
      console.error(err);
      MixAppApi.notify(err?.message || "Save failed", true);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAsNew() {
    if (!tracks.length) return;
    const base = playlist?.name || "MixApp playlist";
    const name = `${base} (MixApp)`;
    setSaving(true);
    try {
      const uri = await MixAppApi.createPlaylist(
        name,
        tracks.map((t) => t.uri)
      );
      MixAppApi.notify(`Created “${name}”`);
      await refreshPlaylists();
      await loadPlaylist(uri);
    } catch (err) {
      console.error(err);
      MixAppApi.notify(err?.message || "Create failed", true);
    } finally {
      setSaving(false);
    }
  }

  function handleToggleSeed(uri) {
    if (!uri) return;
    setSeedUris((prev) =>
      prev.includes(uri) ? prev.filter((u) => u !== uri) : [...prev, uri]
    );
  }

  function handleToggleSearch() {
    setSearchOpen((open) => {
      if (open) setResultsOpen(false);
      return !open;
    });
  }

  async function handleFitToSeeds() {
    const ids = seedUris
      .map((uri) => MixAppRecommend.trackIdFromUri(uri))
      .filter(Boolean);
    if (!ids.length) {
      MixAppApi.notify("Select seed tracks first", true);
      return;
    }
    setSearchFitting(true);
    setSearchError(null);
    try {
      const samples = await MixAppFeatures.getFeatureSamples(ids);
      if (!samples.length) {
        MixAppApi.notify("No audio features for those seeds", true);
        return;
      }
      setSearchFeatures(MixAppRecommend.featuresFromSamples(samples));
      MixAppApi.notify("Feature ranges fitted to seeds");
    } catch (err) {
      console.error(err);
      setSearchError(err?.message || "Failed to fit features");
    } finally {
      setSearchFitting(false);
    }
  }

  async function handleSearch() {
    const seedTrackIds = seedUris
      .map((uri) => MixAppRecommend.trackIdFromUri(uri))
      .filter(Boolean);
    if (!seedTrackIds.length) {
      MixAppApi.notify("Click playlist tracks to mark seeds first", true);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    setResultsOpen(true);
    try {
      const existingSet = new Set(tracks.map((t) => t.uri).filter(Boolean));
      const hideExistingUris = searchFilters.hideExisting
        ? [...existingSet]
        : [];

      let excludeArtistIds = [];
      if (searchFilters.hideExistingArtists) {
        const ids = new Set();
        for (const t of tracks || []) {
          for (const id of t.artistIds || []) ids.add(id);
        }
        excludeArtistIds = [...ids];
      }

      const yearMin =
        searchFilters.yearMin === ""
          ? null
          : parseInt(searchFilters.yearMin, 10);
      const yearMax =
        searchFilters.yearMax === ""
          ? null
          : parseInt(searchFilters.yearMax, 10);

      const seedTracks = (tracks || []).filter((t) =>
        seedUris.includes(t.uri)
      );
      const camelotMoves = Array.isArray(searchFilters.camelotMoves)
        ? searchFilters.camelotMoves.filter(Boolean)
        : [];
      const wantLimit = Number(resultLimit) || MixAppRecommend.DEFAULT_LIMIT;
      // Camelot filters thin results a lot — over-fetch then cut to Max results.
      const fetchLimit = camelotMoves.length
        ? Math.min(
            MixAppRecommend.MAX_LIMIT,
            Math.max(wantLimit * 3, wantLimit + 80)
          )
        : wantLimit;

      const result = await MixAppRecommend.recommend({
        seedTrackIds,
        seedTracks,
        features: searchFeatures,
        limit: fetchLimit,
        filters: {
          yearMin: Number.isFinite(yearMin) ? yearMin : null,
          yearMax: Number.isFinite(yearMax) ? yearMax : null,
          excludeExplicit: searchFilters.excludeExplicit,
          excludeAberrant: searchFilters.excludeAberrant,
          excludeArtistIds,
          hideExistingUris,
          bannedUris,
          includeSeedTracks: false,
        },
      });

      let list = Array.isArray(result?.tracks) ? result.tracks : [];
      try {
        list = await MixAppFeatures.enrichTracks(list.slice());
      } catch (featErr) {
        console.warn("MixApp: result key enrich failed", featErr);
      }

      if (camelotMoves.length) {
        list = MixAppFeatures.filterTracksByCamelotMoves(
          list,
          seedTracks,
          camelotMoves
        ).slice(0, wantLimit);
      }

      setSearchResults(list);
      if (!list.length) {
        MixAppApi.notify(
          "No matches after filters — try disabling filters or ranges",
          true
        );
      }
    } catch (err) {
      console.error(err);
      const msg =
        err?.message ||
        err?.body?.error?.message ||
        "Search request failed";
      setSearchError(msg);
      setSearchResults([]);
      MixAppApi.notify(msg, true);
    } finally {
      setSearchLoading(false);
    }
  }

  function handleHideResult(track) {
    if (!track?.uri) return;
    setBannedUris((prev) =>
      prev.includes(track.uri) ? prev : [...prev, track.uri]
    );
    setSearchResults((prev) => prev.filter((t) => t.uri !== track.uri));
  }

  function handleAddRecommended(track) {
    if (!track?.uri) return;
    if (tracks.some((t) => t.uri === track.uri)) {
      MixAppApi.notify("Track already in playlist", true);
      return;
    }
    const nextTrack = {
      uri: track.uri,
      uid: `added:${track.uri}:${Date.now()}`,
      id: track.id || MixAppRecommend.trackIdFromUri(track.uri),
      name: track.name || "Unknown",
      artists: track.artists || "",
      artistIds: track.artistIds || [],
      album: track.album || "",
      durationMs: track.durationMs || 0,
      explicit: !!track.explicit,
      addedAt: new Date().toISOString(),
      year: track.year ?? null,
      bpm: track.bpm ?? null,
      key: track.key ?? null,
    };
    commitTracks([...tracks, nextTrack]);
    setSearchResults((prev) => prev.filter((t) => t.uri !== track.uri));
    MixAppApi.notify(`Added “${nextTrack.name}”`);
    MixAppFeatures.enrichTracks([nextTrack])
      .then(() => {
        setTracks((prev) =>
          prev.map((t) =>
            t.uid === nextTrack.uid
              ? { ...t, bpm: nextTrack.bpm, key: nextTrack.key }
              : t
          )
        );
      })
      .catch(() => {});
  }

  function handlePlay(track, index) {
    try {
      const uri = track?.uri;
      if (!uri) return;

      const currentUri =
        Spicetify?.Player?.data?.item?.uri ||
        Spicetify?.Player?.data?.track?.uri ||
        playingUri;
      const currentlyPlaying = !!Spicetify?.Player?.isPlaying?.();

      // Same track already playing → pause / stop
      if (currentUri === uri && currentlyPlaying) {
        if (Spicetify?.Player?.pause) {
          Spicetify.Player.pause();
        } else if (Spicetify?.Platform?.PlayerAPI?.pause) {
          Spicetify.Platform.PlayerAPI.pause();
        }
        setIsPlaying(false);
        return;
      }

      // Same track paused → resume
      if (currentUri === uri && !currentlyPlaying && Spicetify?.Player?.play) {
        Spicetify.Player.play();
        setIsPlaying(true);
        return;
      }

      const uris = tracks.map((t) => t.uri).filter(Boolean);
      if (Spicetify?.Player?.playUri) {
        Spicetify.Player.playUri(uri);
        setPlayingUri(uri);
        setIsPlaying(true);
        return;
      }
      if (Spicetify?.Platform?.PlayerAPI?.play) {
        Spicetify.Platform.PlayerAPI.play(
          { uri },
          {},
          { skipToUri: uri }
        );
        setPlayingUri(uri);
        setIsPlaying(true);
        return;
      }
      if (uris.length && Spicetify?.Platform?.PlayerAPI?.play) {
        Spicetify.Platform.PlayerAPI.play(
          { uri: playlist?.uri },
          {},
          { skipToIndex: index }
        );
        setPlayingUri(uri);
        setIsPlaying(true);
      }
    } catch (err) {
      console.warn("MixApp: play failed", err);
      MixAppApi.notify("Could not start playback", true);
    }
  }

  return react.createElement(
    "div",
    { className: "mixapp-root" },
    react.createElement(
      "header",
      { className: "mixapp-header" },
      react.createElement("h1", null, "MixApp"),
      react.createElement(
        "p",
        { className: "mixapp-subtitle" },
        "Load a playlist, mark seed tracks, search for similar tracks, and save back to Spotify."
      )
    ),
    react.createElement(MixAppToolbar, {
      playlist,
      tracks,
      dirty,
      canUndo,
      canRedo,
      saving,
      searchOpen,
      statsOpen,
      seedCount: seedUris.length,
      playlists,
      selectedUri,
      listLoading,
      onSelectPlaylist: loadPlaylist,
      onRefreshPlaylists: refreshPlaylists,
      onUndo: handleUndo,
      onRedo: handleRedo,
      onSave: handleSave,
      onSaveAsNew: handleSaveAsNew,
      onToggleSearch: handleToggleSearch,
      onToggleStats: () => setStatsOpen((v) => !v),
    }),
    react.createElement(MixAppStatsPanel, {
      open: statsOpen,
      tracks,
      onClose: () => setStatsOpen(false),
    }),
    react.createElement(MixAppSearchPanel, {
      open: searchOpen,
      seedUris,
      tracks,
      features: searchFeatures,
      filters: searchFilters,
      resultLimit,
      loading: searchLoading,
      fitting: searchFitting,
      error: searchError,
      onClose: () => {
        setSearchOpen(false);
        setResultsOpen(false);
      },
      onFeaturesChange: setSearchFeatures,
      onFiltersChange: setSearchFilters,
      onResultLimitChange: setResultLimit,
      onFitToSeeds: handleFitToSeeds,
      onResetFeatures: () =>
        setSearchFeatures(MixAppRecommend.defaultFeatureState()),
      onSearch: handleSearch,
    }),
    error
      ? react.createElement("div", { className: "mixapp-error" }, error)
      : null,
    react.createElement(
      "div",
      { className: "mixapp-main" },
      react.createElement(
        "div",
        { className: "mixapp-main-arranger" },
        react.createElement(MixAppArranger, {
          tracks,
          loading: tracksLoading,
          playingUri,
          isPlaying,
          seedUris,
          filters: arrangerFilters,
          onFiltersChange: setArrangerFilters,
          onReorder: handleReorder,
          onPlay: handlePlay,
          onToggleSeed: handleToggleSeed,
        }),
        playlist
          ? react.createElement(
              "p",
              { className: "mixapp-footer-hint" },
              tracks.length + " tracks",
              seedUris.length ? " · " + seedUris.length + " seeds" : "",
              dirty ? " · local changes not saved" : ""
            )
          : null
      )
    ),
    react.createElement(MixAppSearchResults, {
      open: resultsOpen,
      results: searchResults,
      loading: searchLoading,
      playingUri,
      isPlaying,
      onClose: () => setResultsOpen(false),
      onAddTrack: handleAddRecommended,
      onHideTrack: handleHideResult,
      onPlay: handlePlay,
    })
  );
}
