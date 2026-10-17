//@ts-check

function MixAppPage() {
  const react = Spicetify.React;
  const savedSessionRef = react.useRef(null);
  if (savedSessionRef.current === null) {
    savedSessionRef.current = MixAppSession.load() || false;
  }
  const saved = savedSessionRef.current || null;
  const prefsRef = react.useRef(null);
  if (prefsRef.current === null) {
    prefsRef.current = MixAppPrefs.load();
  }
  const prefs = prefsRef.current;

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
  const [searchOpen, setSearchOpen] = react.useState(
    () => !!saved?.searchOpen || !!prefs?.preferSearchOpen
  );
  const [resultsOpen, setResultsOpen] = react.useState(
    () => !!saved?.resultsOpen
  );
  const [statsOpen, setStatsOpen] = react.useState(
    () => !!saved?.statsOpen || !!prefs?.preferStatsOpen
  );
  const [seedUris, setSeedUris] = react.useState(() =>
    Array.isArray(saved?.seedUris) ? saved.seedUris : []
  );
  const [searchFeatures, setSearchFeatures] = react.useState(() =>
    saved?.searchFeatures || MixAppRecommend.defaultFeatureState()
  );
  const [searchFilters, setSearchFilters] = react.useState(() => {
    const base = {
      ...(MixAppPrefs.defaults().searchFilters || {}),
      ...(prefs?.searchFilters || {}),
    };
    const savedFilters = saved?.searchFilters || {};
    return {
      ...base,
      ...savedFilters,
      camelotMoves: Array.isArray(savedFilters.camelotMoves)
        ? savedFilters.camelotMoves
        : Array.isArray(base.camelotMoves)
          ? base.camelotMoves
          : [],
    };
  });
  const [resultLimit, setResultLimit] = react.useState(
    () => saved?.resultLimit || prefs?.resultLimit || 100
  );
  const [searchResults, setSearchResults] = react.useState(() =>
    Array.isArray(saved?.searchResults) ? saved.searchResults : []
  );
  const [searchLoading, setSearchLoading] = react.useState(false);
  const searchGenRef = react.useRef(0);
  /** URIs shown in recent searches — prefer fresh tracks on the next run. */
  const searchSeenUrisRef = react.useRef(new Set());
  const [searchFitting, setSearchFitting] = react.useState(false);
  const [searchError, setSearchError] = react.useState(null);
  const [bannedUris, setBannedUris] = react.useState(() =>
    Array.isArray(saved?.bannedUris) ? saved.bannedUris : []
  );
  const [addTrackOpen, setAddTrackOpen] = react.useState(false);
  const [copyPlaylistOpen, setCopyPlaylistOpen] = react.useState(false);
  const [flowifyOpen, setFlowifyOpen] = react.useState(false);
  const [generatorOpen, setGeneratorOpen] = react.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = react.useState(false);

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
    searchOpen,
    statsOpen,
    resultsOpen,
    searchResults,
    canUndo,
    canRedo,
  ]);

  // Durable UI prefs (filters, limits, panel preference).
  react.useEffect(() => {
    MixAppPrefs.patch({
      resultLimit,
      searchFilters,
      preferSearchOpen: !!searchOpen,
      preferStatsOpen: !!statsOpen,
    });
    prefsRef.current = MixAppPrefs.load();
  }, [resultLimit, searchFilters, searchOpen, statsOpen]);

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
    searchSeenUrisRef.current = new Set();
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

  function handleRemoveTrack(index, track) {
    if (index == null || index < 0 || index >= tracks.length) return;
    const removed = track || tracks[index];
    const next = tracks.slice();
    next.splice(index, 1);
    commitTracks(next);
    if (removed?.uri) {
      setSeedUris((prev) => prev.filter((u) => u !== removed.uri));
    }
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
      const savedTracks = await MixAppApi.saveOverwrite(playlist.uri, tracks);
      // Refresh uids from Spotify; keep local feature enrichments when possible.
      if (Array.isArray(savedTracks) && savedTracks.length) {
        const byUri = new Map();
        for (const t of tracks) {
          if (!t?.uri) continue;
          if (!byUri.has(t.uri)) byUri.set(t.uri, []);
          byUri.get(t.uri).push(t);
        }
        setTracks(
          savedTracks.map((t) => {
            const queue = byUri.get(t.uri);
            const prev = queue && queue.length ? queue.shift() : null;
            if (!prev) return t;
            return {
              ...t,
              bpm: prev.bpm ?? t.bpm,
              key: prev.key ?? t.key,
              year: prev.year ?? t.year,
            };
          })
        );
      }
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

  function closeResultsPanel() {
    searchGenRef.current += 1;
    setSearchLoading(false);
    setSearchResults([]);
    setResultsOpen(false);
  }

  function handleToggleSearch() {
    setSearchOpen((open) => {
      if (open) closeResultsPanel();
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
    if (!seedTrackIds.length && !tracks.length) {
      MixAppApi.notify("Load a playlist or mark seed tracks first", true);
      return;
    }

    const gen = ++searchGenRef.current;
    // Drop previous results so the panel always starts a fresh search.
    setSearchResults([]);
    setSearchLoading(true);
    setSearchError(null);
    setResultsOpen(true);

    // Snapshot current settings so this run isn't affected by later UI edits.
    const featuresSnap = searchFeatures;
    const filtersSnap = searchFilters;
    const bannedSnap = bannedUris;
    const tracksSnap = tracks;
    const seedUrisSnap = seedUris;
    const resultLimitSnap = resultLimit;

    try {
      const hideExistingOn = !!filtersSnap.hideExisting;
      const hideExistingUris = hideExistingOn
        ? (tracksSnap || []).map((t) => t.uri).filter(Boolean)
        : [];
      const excludeTrackIds = hideExistingOn
        ? (tracksSnap || [])
            .map((t) => t.id || MixAppRecommend.trackIdFromUri(t.uri))
            .filter(Boolean)
        : [];
      const hideExistingTracks = hideExistingOn ? tracksSnap || [] : [];

      let excludeArtistIds = [];
      if (filtersSnap.hideExistingArtists) {
        const ids = new Set();
        for (const t of tracksSnap || []) {
          for (const id of t.artistIds || []) ids.add(id);
        }
        excludeArtistIds = [...ids];
      }

      const yearMin =
        filtersSnap.yearMin === ""
          ? null
          : parseInt(filtersSnap.yearMin, 10);
      const yearMax =
        filtersSnap.yearMax === ""
          ? null
          : parseInt(filtersSnap.yearMax, 10);

      const seedTracks = (tracksSnap || []).filter((t) =>
        seedUrisSnap.includes(t.uri)
      );
      // Mix-in-key without marked seeds: use the playlist as harmonic context.
      const camelotSeeds = seedTracks.length ? seedTracks : tracksSnap;
      const camelotMoves = Array.isArray(filtersSnap.camelotMoves)
        ? filtersSnap.camelotMoves.filter(Boolean)
        : [];
      const wantLimit =
        Number(resultLimitSnap) || MixAppRecommend.DEFAULT_LIMIT;
      // Camelot filters thin results a lot — over-fetch then cut to Max results.
      const fetchLimit = camelotMoves.length
        ? Math.min(
            MixAppRecommend.MAX_LIMIT,
            Math.max(wantLimit * 3, wantLimit + 80)
          )
        : wantLimit;

      const postFilters = {
        yearMin: Number.isFinite(yearMin) ? yearMin : null,
        yearMax: Number.isFinite(yearMax) ? yearMax : null,
        excludeExplicit: !!filtersSnap.excludeExplicit,
        excludeAberrant: !!filtersSnap.excludeAberrant,
        excludeArtistIds,
        excludeTrackIds,
        hideExistingUris,
        hideExistingTracks,
        bannedUris: bannedSnap,
        includeSeedTracks: false,
        seedTrackIds: [],
      };

      const avoidUris = [...searchSeenUrisRef.current];

      const result = await MixAppRecommend.recommend({
        seedTrackIds,
        seedTracks,
        contextTracks: tracksSnap,
        features: featuresSnap,
        limit: fetchLimit,
        avoidUris,
        filters: postFilters,
      });

      if (gen !== searchGenRef.current) return;

      let list = Array.isArray(result?.tracks) ? result.tracks : [];
      try {
        list = await MixAppFeatures.enrichTracks(list.slice());
      } catch (featErr) {
        console.warn("MixApp: result key enrich failed", featErr);
      }

      if (gen !== searchGenRef.current) return;

      if (camelotMoves.length) {
        list = MixAppFeatures.filterTracksByCamelotMoves(
          list,
          camelotSeeds,
          camelotMoves
        );
      }

      // Re-apply after enrich / Camelot so playlist tracks can't slip back in.
      list = MixAppRecommend.applyPostFilters(list, postFilters);
      // Camelot / post-filter may leave more than Max results — resample randomly.
      if (list.length > wantLimit) {
        list = MixAppRecommend.sampleResults
          ? MixAppRecommend.sampleResults(list, wantLimit, avoidUris)
          : list.slice(0, wantLimit);
      }

      for (const t of list) {
        if (t?.uri) searchSeenUrisRef.current.add(t.uri);
      }
      // Cap memory so old avoids eventually rotate out.
      if (searchSeenUrisRef.current.size > 800) {
        searchSeenUrisRef.current = new Set(
          [...searchSeenUrisRef.current].slice(-400)
        );
      }

      setSearchResults(list);
      if (!list.length) {
        MixAppApi.notify(
          "No matches after filters — try disabling filters or ranges",
          true
        );
      }
    } catch (err) {
      if (gen !== searchGenRef.current) return;
      console.error(err);
      const msg =
        err?.message ||
        err?.body?.error?.message ||
        "Search request failed";
      setSearchError(msg);
      setSearchResults([]);
      MixAppApi.notify(msg, true);
    } finally {
      if (gen === searchGenRef.current) setSearchLoading(false);
    }
  }

  function handleHideResult(track) {
    if (!track?.uri) return;
    setBannedUris((prev) =>
      prev.includes(track.uri) ? prev : [...prev, track.uri]
    );
    setSearchResults((prev) => prev.filter((t) => t.uri !== track.uri));
  }

  function trackAlreadyInPlaylist(track, list) {
    if (!track?.uri) return true;
    const id = track.id || MixAppRecommend.trackIdFromUri(track.uri);
    const fp = MixAppRecommend.trackFingerprint?.(track);
    return (list || []).some((t) => {
      if (t?.uri && t.uri === track.uri) return true;
      const tid = t?.id || MixAppRecommend.trackIdFromUri(t?.uri);
      if (id && tid && tid === id) return true;
      const tfp = MixAppRecommend.trackFingerprint?.(t);
      if (fp && tfp && fp === tfp) return true;
      return false;
    });
  }

  function toPlaylistTrack(track, stamp) {
    return {
      uri: track.uri,
      uid: `added:${track.uri}:${stamp}`,
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
  }

  function enrichAdded(nextTracks) {
    MixAppFeatures.enrichTracks(nextTracks.slice())
      .then(() => {
        const byUid = new Map(nextTracks.map((t) => [t.uid, t]));
        setTracks((prev) =>
          prev.map((t) => {
            const n = byUid.get(t.uid);
            return n ? { ...t, bpm: n.bpm ?? t.bpm, key: n.key ?? t.key } : t;
          })
        );
      })
      .catch(() => {});
  }

  function handleAddRecommended(track) {
    if (!track?.uri) return;
    if (trackAlreadyInPlaylist(track, tracks)) {
      MixAppApi.notify("Track already in playlist", true);
      return;
    }
    const nextTrack = toPlaylistTrack(track, Date.now());
    commitTracks([...tracks, nextTrack]);
    setSearchResults((prev) => prev.filter((t) => t.uri !== track.uri));
    MixAppApi.notify(`Added “${nextTrack.name}”`);
    enrichAdded([nextTrack]);
  }

  function handleAddCatalogTrack(track) {
    if (!track?.uri) return;
    if (trackAlreadyInPlaylist(track, tracks)) {
      MixAppApi.notify("Track already in playlist", true);
      return;
    }
    const nextTrack = toPlaylistTrack(track, Date.now());
    commitTracks([...tracks, nextTrack]);
    MixAppApi.notify(`Added “${nextTrack.name}”`);
    enrichAdded([nextTrack]);
  }

  function handleAddCatalogTracks(batch) {
    const list = Array.isArray(batch) ? batch : [];
    const stamp = Date.now();
    const added = [];
    let working = tracks.slice();
    for (let i = 0; i < list.length; i++) {
      const track = list[i];
      if (!track?.uri || trackAlreadyInPlaylist(track, working)) continue;
      const next = toPlaylistTrack(track, stamp + i);
      working.push(next);
      added.push(next);
    }
    if (!added.length) {
      MixAppApi.notify("No new tracks to add", true);
      return;
    }
    commitTracks(working);
    MixAppApi.notify(
      added.length === 1
        ? `Added “${added[0].name}”`
        : `Added ${added.length} tracks`
    );
    enrichAdded(added);
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

  function closeTopOverlay() {
    if (shortcutsOpen) {
      setShortcutsOpen(false);
      return true;
    }
    if (generatorOpen) {
      setGeneratorOpen(false);
      return true;
    }
    if (flowifyOpen) {
      setFlowifyOpen(false);
      return true;
    }
    if (copyPlaylistOpen) {
      setCopyPlaylistOpen(false);
      return true;
    }
    if (addTrackOpen) {
      setAddTrackOpen(false);
      return true;
    }
    if (resultsOpen) {
      closeResultsPanel();
      return true;
    }
    if (searchOpen) {
      setSearchOpen(false);
      return true;
    }
    if (statsOpen) {
      setStatsOpen(false);
      return true;
    }
    return false;
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = String(el.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    return !!el.closest?.("input, textarea, select, [contenteditable=true]");
  }

  react.useEffect(() => {
    function onKey(e) {
      const mod = e.ctrlKey || e.metaKey;
      const typing = isTypingTarget(e.target);

      if (e.key === "Escape") {
        if (closeTopOverlay()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (!mod && !typing && (e.key === "?" || (e.key === "/" && e.shiftKey))) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      if (!mod) return;

      const key = String(e.key || "").toLowerCase();

      // Save works even while typing in fields.
      if (key === "s" && !e.shiftKey) {
        e.preventDefault();
        if (!saving) handleSave();
        return;
      }
      if (key === "s" && e.shiftKey) {
        e.preventDefault();
        if (!saving) handleSaveAsNew();
        return;
      }

      if (typing) return;

      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (key === "f" && !e.shiftKey) {
        e.preventDefault();
        handleToggleSearch();
        return;
      }
      if (key === "a" && e.shiftKey) {
        e.preventDefault();
        if (playlist) {
          setCopyPlaylistOpen(false);
          setFlowifyOpen(false);
          setGeneratorOpen(false);
          setAddTrackOpen(true);
        }
        return;
      }
      if (key === "c" && e.shiftKey) {
        e.preventDefault();
        if (playlist) {
          setAddTrackOpen(false);
          setFlowifyOpen(false);
          setGeneratorOpen(false);
          setCopyPlaylistOpen(true);
        }
        return;
      }
      if (key === "f" && e.shiftKey) {
        e.preventDefault();
        if (playlist && tracks.length) {
          setAddTrackOpen(false);
          setCopyPlaylistOpen(false);
          setGeneratorOpen(false);
          setFlowifyOpen(true);
        }
        return;
      }
      if (key === "g" && e.shiftKey) {
        e.preventDefault();
        if (playlist && tracks.length) {
          setAddTrackOpen(false);
          setCopyPlaylistOpen(false);
          setFlowifyOpen(false);
          setGeneratorOpen(true);
        }
        return;
      }
      if (key === "t" && e.shiftKey) {
        e.preventDefault();
        setStatsOpen((v) => !v);
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return react.createElement(
    "div",
    { className: "mixapp-root" },
    react.createElement(
      "header",
      { className: "mixapp-header" },
      react.createElement(
        "div",
        { className: "mixapp-header-row" },
        react.createElement("h1", null, "MixApp"),
        react.createElement(
          "button",
          {
            type: "button",
            className: "mixapp-btn mixapp-btn-ghost mixapp-btn-compact",
            onClick: () => setShortcutsOpen(true),
            title: "Keyboard shortcuts (?)",
          },
          "?"
        )
      ),
      react.createElement(
        "p",
        { className: "mixapp-subtitle" },
        "Load a playlist, rearrange, find tracks, and save back to Spotify. Press ? for shortcuts."
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
      onOpenAddTrack: () => {
        setCopyPlaylistOpen(false);
        setFlowifyOpen(false);
        setGeneratorOpen(false);
        setAddTrackOpen(true);
      },
      onOpenCopyPlaylist: () => {
        setAddTrackOpen(false);
        setFlowifyOpen(false);
        setGeneratorOpen(false);
        setCopyPlaylistOpen(true);
      },
      onOpenFlowify: () => {
        setAddTrackOpen(false);
        setCopyPlaylistOpen(false);
        setGeneratorOpen(false);
        setFlowifyOpen(true);
      },
      onOpenGenerator: () => {
        setAddTrackOpen(false);
        setCopyPlaylistOpen(false);
        setFlowifyOpen(false);
        setGeneratorOpen(true);
      },
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
        closeResultsPanel();
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
          onReorder: handleReorder,
          onPlay: handlePlay,
          onToggleSeed: handleToggleSeed,
          onRemove: handleRemoveTrack,
        })
      )
    ),
    react.createElement(MixAppSearchResults, {
      open: resultsOpen,
      results: searchResults,
      loading: searchLoading,
      playingUri,
      isPlaying,
      onClose: closeResultsPanel,
      onAddTrack: handleAddRecommended,
      onHideTrack: handleHideResult,
      onPlay: handlePlay,
    }),
    react.createElement(MixAppAddTrackModal, {
      open: addTrackOpen,
      playlistTracks: tracks,
      playingUri,
      isPlaying,
      onClose: () => setAddTrackOpen(false),
      onAddTrack: handleAddCatalogTrack,
      onPlay: handlePlay,
    }),
    react.createElement(MixAppCopyPlaylistModal, {
      open: copyPlaylistOpen,
      libraryPlaylists: playlists,
      currentPlaylistUri: selectedUri,
      playlistTracks: tracks,
      playingUri,
      isPlaying,
      onClose: () => setCopyPlaylistOpen(false),
      onAddTrack: handleAddCatalogTrack,
      onAddTracks: handleAddCatalogTracks,
      onPlay: handlePlay,
    }),
    react.createElement(MixAppFlowifyModal, {
      open: flowifyOpen,
      tracks,
      onClose: () => setFlowifyOpen(false),
      onApply: (next) => {
        if (Array.isArray(next) && next.length) commitTracks(next);
      },
    }),
    react.createElement(MixAppGeneratorModal, {
      open: generatorOpen,
      playlist,
      tracks,
      seedUris,
      onClose: () => setGeneratorOpen(false),
      onCreated: async (uri) => {
        if (!uri) return;
        try {
          await refreshPlaylists();
          await loadPlaylist(uri);
        } catch (err) {
          console.error(err);
        }
      },
    }),
    react.createElement(MixAppShortcutsHelp, {
      open: shortcutsOpen,
      onClose: () => setShortcutsOpen(false),
    })
  );
}
