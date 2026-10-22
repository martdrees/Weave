//@ts-check
/**
 * Playlist list/load/save + dirty/undo wiring.
 *
 * @param {{
 *   saved: object|null,
 *   onBeforePlaylistLoad?: () => void,
 *   onClearPlaylist?: () => void,
 * }} opts
 */
function MixAppUsePlaylistSession(opts) {
  const react = Spicetify.React;
  const saved = opts?.saved || null;
  const onBeforePlaylistLoad = opts?.onBeforePlaylistLoad;
  const onClearPlaylist = opts?.onClearPlaylist;

  const undoRef = react.useRef(null);
  if (!undoRef.current) {
    undoRef.current = MixAppCreateUndoStack(40);
    if (saved?.undo) undoRef.current.importState(saved.undo);
  }

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
  const [canUndo, setCanUndo] = react.useState(
    () => !!(saved?.undo?.past && saved.undo.past.length)
  );
  const [canRedo, setCanRedo] = react.useState(
    () => !!(saved?.undo?.future && saved.undo.future.length)
  );
  const [error, setError] = react.useState(null);
  /** Brief arranger motion (R5.4): row uids and/or whole-list flash key. */
  const [rowFlashUids, setRowFlashUids] = react.useState([]);
  const [listFlashKey, setListFlashKey] = react.useState(0);
  const flashTimerRef = react.useRef(null);

  const loadGenRef = react.useRef(0);
  const selectedUriRef = react.useRef(selectedUri);
  selectedUriRef.current = selectedUri;
  const tracksLoadingRef = react.useRef(tracksLoading);
  tracksLoadingRef.current = tracksLoading;

  function syncUndoFlags() {
    setCanUndo(undoRef.current.canUndo());
    setCanRedo(undoRef.current.canRedo());
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
      setError(err?.message || MixAppI18n.t("notify.failedPlaylists"));
      MixAppApi.notify(MixAppI18n.t("notify.failedPlaylists"), true);
    } finally {
      setListLoading(false);
    }
  }

  react.useEffect(() => {
    refreshPlaylists();
  }, []);

  // Session restore may have Camelot keys from audio-features; reload once so
  // keys match Spotify’s playlist Key column (AudioAttributesV2).
  react.useEffect(() => {
    if (!selectedUri || !tracks.length) return;
    if (tracks.some((t) => t && t.keyNative)) return;
    loadPlaylist(selectedUri, { force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot after restore
  }, []);

  async function loadPlaylist(uri, opts) {
    const force = !!(opts && opts.force);
    if (!uri) {
      loadGenRef.current += 1;
      onClearPlaylist?.();
      setSelectedUri(null);
      setPlaylist(null);
      setTracks([]);
      setDirty(false);
      undoRef.current.clear();
      syncUndoFlags();
      MixAppSession.clear();
      return;
    }

    if (!force && uri === selectedUri && tracks.length) {
      return;
    }

    onBeforePlaylistLoad?.();
    const loadGen = ++loadGenRef.current;
    setSelectedUri(uri);
    setTracksLoading(true);
    setError(null);
    try {
      // Prefer library list for meta so we do not race tracks against /v1/playlists
      // (and stampede into 429 when Platform getContents already failed).
      const listed = playlists.find((p) => p.uri === uri);
      let meta = listed
        ? {
            uri: listed.uri,
            name: listed.name || "Playlist",
            description: "",
            isOwnedBySelf: !!listed.isOwnedBySelf,
            collaborative: !!listed.collaborative,
            totalLength: listed.totalLength ?? null,
          }
        : null;

      const items = await MixAppApi.getPlaylistTracks(uri);
      if (loadGen !== loadGenRef.current) return;

      if (!meta) {
        meta = await MixAppApi.getPlaylistMeta(uri);
        if (loadGen !== loadGenRef.current) return;
      } else if (listed?.canEdit === false) {
        meta.isOwnedBySelf = false;
        meta.collaborative = false;
      }

      setPlaylist(meta);
      setTracks(items);
      setDirty(false);
      undoRef.current.clear();
      syncUndoFlags();
      setTracksLoading(false);
      try {
        const enriched = await MixAppFeatures.enrichTracks(items.slice());
        if (loadGen !== loadGenRef.current) return;
        setTracks(enriched.slice());
      } catch (featErr) {
        console.warn("Weave: feature enrich failed", featErr);
      }
      return;
    } catch (err) {
      if (loadGen !== loadGenRef.current) return;
      const unavailable =
        err?.code === "PLAYLIST_UNAVAILABLE" ||
        MixAppPlaylists?.isPlaylistUnavailableError?.(err);
      const rateLimited = !unavailable && MixAppHttp?.isRateLimitError?.(err);
      const msg = unavailable
        ? MixAppI18n.t("notify.playlistUnavailable")
        : rateLimited
          ? MixAppI18n.t("notify.rateLimit")
          : err?.message || MixAppI18n.t("notify.failedPlaylist");
      if (!unavailable) console.error(err);
      else console.warn("Weave: playlist unavailable", err);
      setError(msg);
      MixAppApi.notify(msg, true);
      setPlaylist(null);
      setTracks([]);
      if (unavailable && uri) {
        MixAppPlaylists?.markPlaylistUnavailable?.(uri);
        setPlaylists((prev) => (prev || []).filter((p) => p.uri !== uri));
        setSelectedUri(null);
      }
    } finally {
      if (loadGen === loadGenRef.current) setTracksLoading(false);
    }
  }

  function clearFlashSoon() {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      flashTimerRef.current = null;
      setRowFlashUids([]);
    }, 700);
  }

  /** Highlight specific rows (track add). */
  function flashRows(uids) {
    const ids = (uids || []).map(String).filter(Boolean);
    if (!ids.length) return;
    setRowFlashUids(ids);
    clearFlashSoon();
  }

  /** Pulse the whole arranger (Flowify / bulk rearrange). */
  function flashList() {
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    setRowFlashUids([]);
    setListFlashKey((k) => k + 1);
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
    if (index == null || index < 0 || index >= tracks.length) return null;
    const removed = track || tracks[index];
    const next = tracks.slice();
    next.splice(index, 1);
    commitTracks(next);
    return removed || null;
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
    if (tracksLoadingRef.current || saving) return;
    const uriAtStart = playlist.uri;
    const tracksAtStart = tracks;
    setSaving(true);
    try {
      if (tracksLoadingRef.current) {
        MixAppApi.notify(MixAppI18n.t("notify.cannotSaveLoading"), true);
        return;
      }
      if (selectedUriRef.current !== uriAtStart) {
        MixAppApi.notify(MixAppI18n.t("notify.playlistChangedCancel"), true);
        return;
      }
      const savedTracks = await MixAppApi.saveOverwrite(uriAtStart, tracksAtStart);
      if (selectedUriRef.current !== uriAtStart) {
        MixAppApi.notify(MixAppI18n.t("notify.playlistChangedDuringSave"), true);
        return;
      }
      if (Array.isArray(savedTracks) && savedTracks.length) {
        const byUri = new Map();
        for (const t of tracksAtStart) {
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
              keyNative: prev.keyNative || t.keyNative,
              bpmNative: prev.bpmNative || t.bpmNative,
              keyColor: prev.keyColor || t.keyColor,
              standardKey: prev.standardKey || t.standardKey,
              standardMode: prev.standardMode || t.standardMode,
              keyIndex: prev.keyIndex ?? t.keyIndex,
              keyMode: prev.keyMode ?? t.keyMode,
            };
          })
        );
      }
      setDirty(false);
      undoRef.current.clear();
      syncUndoFlags();
      MixAppApi.notify(MixAppI18n.t("notify.playlistSaved"));
    } catch (err) {
      console.error(err);
      MixAppApi.notify(err?.message || MixAppI18n.t("notify.saveFailed"), true);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAsNew() {
    if (!tracks.length) return;
    if (tracksLoadingRef.current || saving) return;
    const base = playlist?.name || MixAppI18n.t("playlist.defaultName");
    const name = MixAppI18n.t("playlist.weaveSuffix", { name: base });
    setSaving(true);
    try {
      if (tracksLoadingRef.current) {
        MixAppApi.notify(MixAppI18n.t("notify.cannotSaveLoading"), true);
        return;
      }
      const uri = await MixAppApi.createPlaylist(
        name,
        tracks.map((t) => t.uri)
      );
      MixAppApi.notify(MixAppI18n.t("notify.created", { name }));
      await refreshPlaylists();
      await loadPlaylist(uri);
    } catch (err) {
      console.error(err);
      MixAppApi.notify(err?.message || MixAppI18n.t("notify.createFailed"), true);
    } finally {
      setSaving(false);
    }
  }

  function handleAddCatalogTrack(track) {
    const { next, added } = MixAppPlaylistOps.appendTracks(tracks, [track]);
    if (!added.length) {
      MixAppApi.notify(MixAppI18n.t("notify.alreadyInPlaylist"), true);
      return;
    }
    commitTracks(next);
    flashRows(added.map((t) => t.uid || t.uri));
    MixAppApi.notify(MixAppI18n.t("notify.addedTrack", { name: added[0].name }));
    MixAppPlaylistOps.enrichAdded(added, setTracks);
  }

  function handleAddCatalogTracks(batch) {
    const { next, added } = MixAppPlaylistOps.appendTracks(tracks, batch);
    if (!added.length) {
      MixAppApi.notify(MixAppI18n.t("notify.noNewTracks"), true);
      return;
    }
    commitTracks(next);
    flashRows(added.map((t) => t.uid || t.uri));
    MixAppApi.notify(
      added.length === 1
        ? MixAppI18n.t("notify.addedTrack", { name: added[0].name })
        : MixAppI18n.t("notify.addedCount", { count: added.length })
    );
    MixAppPlaylistOps.enrichAdded(added, setTracks);
  }

  /** Add a rec result track; returns true if added. */
  function handleAddRecommendedTrack(track) {
    const { next, added } = MixAppPlaylistOps.appendTracks(tracks, [track]);
    if (!added.length) {
      MixAppApi.notify(MixAppI18n.t("notify.alreadyInPlaylist"), true);
      return false;
    }
    commitTracks(next);
    flashRows(added.map((t) => t.uid || t.uri));
    MixAppApi.notify(MixAppI18n.t("notify.addedTrack", { name: added[0].name }));
    MixAppPlaylistOps.enrichAdded(added, setTracks);
    return true;
  }

  return {
    playlists,
    selectedUri,
    playlist,
    tracks,
    listLoading,
    tracksLoading,
    dirty,
    saving,
    canUndo,
    canRedo,
    error,
    rowFlashUids,
    listFlashKey,
    undoRef,
    refreshPlaylists,
    loadPlaylist,
    commitTracks,
    flashRows,
    flashList,
    handleReorder,
    handleRemoveTrack,
    handleUndo,
    handleRedo,
    handleSave,
    handleSaveAsNew,
    handleAddCatalogTrack,
    handleAddCatalogTracks,
    handleAddRecommendedTrack,
  };
}
