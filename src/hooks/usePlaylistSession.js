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
  /** @type {[null|{ kind: string, remoteFingerprint: string|null }, Function]} */
  const [syncConflict, setSyncConflict] = react.useState(null);
  /** User chose Keep Weave while Spotify differed — show quiet badge. */
  const [remoteIgnored, setRemoteIgnored] = react.useState(
    () =>
      !!(
        saved?.dirty &&
        typeof saved?.ignoredRemoteFingerprint === "string" &&
        saved.ignoredRemoteFingerprint
      )
  );

  const loadGenRef = react.useRef(0);
  const selectedUriRef = react.useRef(selectedUri);
  selectedUriRef.current = selectedUri;
  const tracksLoadingRef = react.useRef(tracksLoading);
  tracksLoadingRef.current = tracksLoading;
  /** Synchronous save lock — React `saving` state alone cannot block double Ctrl+S. */
  const savingRef = react.useRef(false);
  /** Provisional uids with an in-flight addTracks write-through. */
  const pendingAddUidsRef = react.useRef(new Set());
  const tracksRef = react.useRef(tracks);
  tracksRef.current = tracks;
  const dirtyRef = react.useRef(dirty);
  dirtyRef.current = dirty;
  const playlistRef = react.useRef(playlist);
  playlistRef.current = playlist;
  const syncCheckInFlightRef = react.useRef(false);
  const syncConflictRef = react.useRef(syncConflict);
  syncConflictRef.current = syncConflict;
  const lastSyncCheckAtRef = react.useRef(0);

  const initialTracksFp = MixAppPlaylistOps.fingerprintTrackOrder(
    Array.isArray(saved?.tracks) ? saved.tracks : tracks
  );
  const [syncedFingerprint, setSyncedFingerprint] = react.useState(() =>
    typeof saved?.syncedFingerprint === "string" && saved.syncedFingerprint
      ? saved.syncedFingerprint
      : saved?.dirty
        ? null
        : initialTracksFp || null
  );
  const [ignoredRemoteFingerprint, setIgnoredRemoteFingerprint] = react.useState(() =>
    typeof saved?.ignoredRemoteFingerprint === "string"
      ? saved.ignoredRemoteFingerprint
      : null
  );
  const syncedFingerprintRef = react.useRef(syncedFingerprint);
  syncedFingerprintRef.current = syncedFingerprint;
  const ignoredRemoteFingerprintRef = react.useRef(ignoredRemoteFingerprint);
  ignoredRemoteFingerprintRef.current = ignoredRemoteFingerprint;

  function sameTrackIdentityOrder(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((t, i) => {
      const u = b[i];
      if (!t || !u) return false;
      if (t.uid && u.uid) return t.uid === u.uid;
      return !!(t.uri && u.uri && t.uri === u.uri);
    });
  }

  function setSyncedBaseline(trackList) {
    const fp = MixAppPlaylistOps.fingerprintTrackOrder(trackList) || null;
    syncedFingerprintRef.current = fp;
    ignoredRemoteFingerprintRef.current = null;
    setSyncedFingerprint(fp);
    setIgnoredRemoteFingerprint(null);
    setRemoteIgnored(false);
  }

  function clearSyncConflict() {
    setSyncConflict(null);
  }

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
    await checkRemoteSync({ reason: "refresh" });
  }

  react.useEffect(() => {
    refreshPlaylists();
    // Mount only (intentional deps omission).
  }, []);

  // Session restore may have Camelot keys from audio-features; reload once so
  // keys match Spotify’s playlist Key column (AudioAttributesV2).
  // Skip when the restored session is dirty — a force reload would wipe unsaved order.
  react.useEffect(() => {
    if (!selectedUri || !tracks.length) return;
    if (dirty) return;
    if (tracks.some((t) => t && t.keyNative)) return;
    loadPlaylist(selectedUri, { force: true });
    // One-shot after restore (intentional deps omission).
  }, []);

  const checkRemoteSyncRef = react.useRef(/** @type {null|Function} */ (null));

  // Re-check Spotify when returning to the Weave view.
  react.useEffect(() => {
    function onVisible() {
      if (document.visibilityState && document.visibilityState !== "visible") {
        return;
      }
      checkRemoteSyncRef.current?.({ reason: "focus" });
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  async function loadPlaylist(uri, opts) {
    const force = !!(opts && opts.force);
    if (!uri) {
      loadGenRef.current += 1;
      onClearPlaylist?.();
      setSelectedUri(null);
      setPlaylist(null);
      tracksRef.current = [];
      setTracks([]);
      setDirty(false);
      setSyncedBaseline([]);
      syncedFingerprintRef.current = null;
      setSyncedFingerprint(null);
      clearSyncConflict();
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
      tracksRef.current = items;
      setDirty(false);
      setSyncedBaseline(items);
      clearSyncConflict();
      undoRef.current.clear();
      syncUndoFlags();
      setTracksLoading(false);
      try {
        const enriched = await MixAppFeatures.enrichTracks(items.slice());
        if (loadGen !== loadGenRef.current) return;
        // Merge features into whatever the user currently has — never hard-replace
        // after enrich, or mid-load reorders/adds are wiped while dirty stays true.
        const byUid = new Map(
          (enriched || []).filter((t) => t?.uid).map((t) => [t.uid, t])
        );
        setTracks((prev) => {
          if (sameTrackIdentityOrder(prev, items)) {
            const next = enriched.slice();
            tracksRef.current = next;
            return next;
          }
          const next = prev.map((t) => {
            const n = (t?.uid && byUid.get(t.uid)) || null;
            if (!n) return t;
            return {
              ...t,
              bpm: n.bpm ?? t.bpm,
              key: n.key ?? t.key,
              year: n.year ?? t.year,
              keyNative: n.keyNative || t.keyNative,
              bpmNative: n.bpmNative || t.bpmNative,
              keyColor: n.keyColor || t.keyColor,
              standardKey: n.standardKey || t.standardKey,
              standardMode: n.standardMode || t.standardMode,
              keyIndex: n.keyIndex ?? t.keyIndex,
              keyMode: n.keyMode ?? t.keyMode,
            };
          });
          tracksRef.current = next;
          return next;
        });
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
    if (savingRef.current) return;
    if (recordUndo) {
      undoRef.current.push(tracksRef.current);
    }
    tracksRef.current = next;
    setTracks(next);
    setDirty(true);
    syncUndoFlags();
  }

  /** Local list update without dirty / undo (write-through add/remove). */
  function replaceTracksLocal(next) {
    tracksRef.current = next;
    setTracks(next);
  }

  function canWriteThroughPlaylist() {
    const p = playlistRef.current;
    if (!p?.uri) return false;
    if (tracksLoadingRef.current || savingRef.current) return false;
    return !!(p.isOwnedBySelf || p.collaborative || p.canEdit);
  }

  /**
   * Persist optimistic adds via mutation port; merge real uids or revert.
   * @param {MixAppTrackRow[]} priorTracks
   * @param {MixAppTrackRow[]} added
   */
  async function persistAddedTracks(priorTracks, added) {
    const uri = playlistRef.current?.uri;
    if (!uri || !added?.length) return;
    const uris = added.map((t) => t.uri).filter(Boolean);
    const pendingUids = added
      .map((t) => t.uid)
      .filter(Boolean)
      .map(String);
    for (const id of pendingUids) pendingAddUidsRef.current.add(id);
    try {
      const remote = await MixAppApi.addTracks(uri, uris, { after: "end" });
      if (selectedUriRef.current !== uri) return;
      const merged = MixAppPlaylistOps.mergeTracksAfterRemoteAdd(
        tracksRef.current,
        remote
      );
      replaceTracksLocal(merged);
      setSyncedBaseline(merged);
      // Re-enrich after uid merge — early enrich may have keyed on provisional uids.
      const uriSet = new Set(uris);
      MixAppPlaylistOps.enrichAdded(
        merged.filter((t) => t?.uri && uriSet.has(t.uri)),
        setTracks
      );
    } catch (err) {
      console.error(err);
      if (selectedUriRef.current === uri) {
        replaceTracksLocal(priorTracks);
        MixAppApi.notify(err?.message || MixAppI18n.t("notify.addFailed"), true);
      }
    } finally {
      for (const id of pendingUids) pendingAddUidsRef.current.delete(id);
    }
  }

  /**
   * Persist optimistic remove via mutation port; restore row on failure.
   * @param {MixAppTrackRow[]} priorTracks
   * @param {MixAppTrackRow} removed
   * @param {number} index
   */
  async function persistRemovedTrack(priorTracks, removed, index) {
    const uri = playlistRef.current?.uri;
    if (!uri || !removed?.uri || !removed?.uid) return;
    try {
      await MixAppApi.removeTracks(uri, [
        { uri: String(removed.uri), uid: String(removed.uid) },
      ]);
      if (selectedUriRef.current !== uri) return;
      setSyncedBaseline(tracksRef.current);
    } catch (err) {
      console.error(err);
      if (selectedUriRef.current === uri) {
        const cur = tracksRef.current.slice();
        const at = Math.max(0, Math.min(index, cur.length));
        cur.splice(at, 0, removed);
        replaceTracksLocal(cur);
        MixAppApi.notify(err?.message || MixAppI18n.t("notify.removeFailed"), true);
      }
    }
  }

  function handleReorder(from, to) {
    if (savingRef.current) return;
    if (from === to) return;
    const next = tracksRef.current.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commitTracks(next);
  }

  function handleRemoveTrack(index, track) {
    if (savingRef.current) return null;
    if (!canWriteThroughPlaylist()) {
      if (playlistRef.current?.uri) {
        MixAppApi.notify(MixAppI18n.t("notify.cannotEditPlaylist"), true);
      }
      return null;
    }
    const list = tracksRef.current;
    if (index == null || index < 0 || index >= list.length) return null;
    const removed = track || list[index];
    if (!removed) return null;

    if (MixAppPlaylistOps.isProvisionalPlaylistUid(removed.uid)) {
      if (pendingAddUidsRef.current.has(String(removed.uid))) {
        MixAppApi.notify(MixAppI18n.t("notify.waitAddBeforeRemove"), true);
        return null;
      }
      // Local-only provisional row (never on Spotify) — drop without API.
      const nextLocal = list.slice();
      nextLocal.splice(index, 1);
      replaceTracksLocal(nextLocal);
      return removed;
    }

    const prior = list.slice();
    const next = list.slice();
    next.splice(index, 1);
    replaceTracksLocal(next);
    void persistRemovedTrack(prior, removed, index);
    return removed;
  }

  function handleUndo() {
    if (savingRef.current) return;
    const prev = undoRef.current.undo(tracksRef.current);
    if (!prev) return;
    tracksRef.current = prev;
    setTracks(prev);
    setDirty(true);
    syncUndoFlags();
  }

  function handleRedo() {
    if (savingRef.current) return;
    const next = undoRef.current.redo(tracksRef.current);
    if (!next) return;
    tracksRef.current = next;
    setTracks(next);
    setDirty(true);
    syncUndoFlags();
  }

  async function handleSave() {
    if (!playlist?.uri || !dirty) return false;
    if (tracksLoadingRef.current || savingRef.current) return false;
    const uriAtStart = playlist.uri;
    const tracksAtStart = tracksRef.current.slice();
    savingRef.current = true;
    setSaving(true);
    try {
      if (tracksLoadingRef.current) {
        MixAppApi.notify(MixAppI18n.t("notify.cannotSaveLoading"), true);
        return false;
      }
      if (selectedUriRef.current !== uriAtStart) {
        MixAppApi.notify(MixAppI18n.t("notify.playlistChangedCancel"), true);
        return false;
      }
      const savedTracks = await MixAppApi.saveOverwrite(uriAtStart, tracksAtStart);
      if (selectedUriRef.current !== uriAtStart) {
        MixAppApi.notify(MixAppI18n.t("notify.playlistChangedDuringSave"), true);
        return false;
      }
      // If something still mutated local state during save, do not clear dirty /
      // overwrite the editor with a stale snapshot.
      if (!sameTrackIdentityOrder(tracksRef.current, tracksAtStart)) {
        MixAppApi.notify(MixAppI18n.t("notify.playlistChangedDuringSave"), true);
        return false;
      }
      let baselineTracks = tracksAtStart;
      if (Array.isArray(savedTracks) && savedTracks.length) {
        const byUri = new Map();
        for (const t of tracksAtStart) {
          if (!t?.uri) continue;
          if (!byUri.has(t.uri)) byUri.set(t.uri, []);
          byUri.get(t.uri).push(t);
        }
        const merged = savedTracks.map((t) => {
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
        });
        tracksRef.current = merged;
        setTracks(merged);
        baselineTracks = merged;
      }
      setDirty(false);
      setSyncedBaseline(baselineTracks);
      clearSyncConflict();
      undoRef.current.clear();
      syncUndoFlags();
      MixAppApi.notify(MixAppI18n.t("notify.playlistSaved"));
      return true;
    } catch (err) {
      console.error(err);
      MixAppApi.notify(err?.message || MixAppI18n.t("notify.saveFailed"), true);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleSaveAsNew() {
    if (!tracksRef.current.length) return;
    if (tracksLoadingRef.current || savingRef.current) return;
    const base = playlist?.name || MixAppI18n.t("playlist.defaultName");
    const name = MixAppI18n.t("playlist.weaveSuffix", { name: base });
    const uris = tracksRef.current.map((t) => t.uri);
    savingRef.current = true;
    setSaving(true);
    try {
      if (tracksLoadingRef.current) {
        MixAppApi.notify(MixAppI18n.t("notify.cannotSaveLoading"), true);
        return;
      }
      const uri = await MixAppApi.createPlaylist(name, uris);
      MixAppApi.notify(MixAppI18n.t("notify.created", { name }));
      await refreshPlaylists();
      await loadPlaylist(uri);
    } catch (err) {
      console.error(err);
      MixAppApi.notify(err?.message || MixAppI18n.t("notify.createFailed"), true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleAddCatalogTrack(track) {
    if (!canWriteThroughPlaylist()) {
      if (playlistRef.current?.uri) {
        MixAppApi.notify(MixAppI18n.t("notify.cannotEditPlaylist"), true);
      }
      return;
    }
    const prior = tracksRef.current.slice();
    const { next, added } = MixAppPlaylistOps.appendTracks(prior, [track]);
    if (!added.length) {
      MixAppApi.notify(MixAppI18n.t("notify.alreadyInPlaylist"), true);
      return;
    }
    replaceTracksLocal(next);
    flashRows(added.map((t) => t.uid || t.uri));
    MixAppApi.notify(MixAppI18n.t("notify.addedTrack", { name: added[0].name }));
    MixAppPlaylistOps.enrichAdded(added, setTracks);
    void persistAddedTracks(prior, added);
  }

  function handleAddCatalogTracks(batch) {
    if (!canWriteThroughPlaylist()) {
      if (playlistRef.current?.uri) {
        MixAppApi.notify(MixAppI18n.t("notify.cannotEditPlaylist"), true);
      }
      return;
    }
    const prior = tracksRef.current.slice();
    const { next, added } = MixAppPlaylistOps.appendTracks(prior, batch);
    if (!added.length) {
      MixAppApi.notify(MixAppI18n.t("notify.noNewTracks"), true);
      return;
    }
    replaceTracksLocal(next);
    flashRows(added.map((t) => t.uid || t.uri));
    MixAppApi.notify(
      added.length === 1
        ? MixAppI18n.t("notify.addedTrack", { name: added[0].name })
        : MixAppI18n.t("notify.addedCount", { count: added.length })
    );
    MixAppPlaylistOps.enrichAdded(added, setTracks);
    void persistAddedTracks(prior, added);
  }

  /** Add a rec result track; returns true if added optimistically. */
  function handleAddRecommendedTrack(track) {
    if (!canWriteThroughPlaylist()) {
      if (playlistRef.current?.uri) {
        MixAppApi.notify(MixAppI18n.t("notify.cannotEditPlaylist"), true);
      }
      return false;
    }
    const prior = tracksRef.current.slice();
    const { next, added } = MixAppPlaylistOps.appendTracks(prior, [track]);
    if (!added.length) {
      MixAppApi.notify(MixAppI18n.t("notify.alreadyInPlaylist"), true);
      return false;
    }
    replaceTracksLocal(next);
    flashRows(added.map((t) => t.uid || t.uri));
    MixAppApi.notify(MixAppI18n.t("notify.addedTrack", { name: added[0].name }));
    MixAppPlaylistOps.enrichAdded(added, setTracks);
    void persistAddedTracks(prior, added);
    return true;
  }

  /**
   * Compare the open playlist to Spotify (membership + order).
   * Runs on Weave focus / Refresh. Skips while loading, saving, or a dialog is open.
   */
  async function checkRemoteSync(opts) {
    const reason = opts?.reason || "auto";
    const uri = selectedUriRef.current;
    if (!uri) return;
    if (!playlistRef.current && !tracksRef.current.length) return;
    if (tracksLoadingRef.current || savingRef.current) return;
    if (syncCheckInFlightRef.current) return;
    if (syncConflictRef.current) return;
    // Focus/visibility can fire often — cooldown unless user hit Refresh.
    const now = Date.now();
    if (reason !== "refresh" && now - lastSyncCheckAtRef.current < 2000) return;

    syncCheckInFlightRef.current = true;
    lastSyncCheckAtRef.current = now;
    try {
      let remoteTracks;
      try {
        remoteTracks = await MixAppApi.getPlaylistTracks(uri);
      } catch (err) {
        if (selectedUriRef.current !== uri) return;
        const unavailable =
          err?.code === "PLAYLIST_UNAVAILABLE" ||
          MixAppPlaylists?.isPlaylistUnavailableError?.(err);
        if (!unavailable) {
          console.warn("Weave: remote sync check failed", err);
          return;
        }
        if (dirtyRef.current) {
          setSyncConflict({
            kind: "unavailable",
            remoteFingerprint: null,
          });
        } else {
          MixAppApi.notify(MixAppI18n.t("notify.playlistUnavailable"), true);
          MixAppPlaylists?.markPlaylistUnavailable?.(uri);
          setPlaylists((prev) => (prev || []).filter((p) => p.uri !== uri));
          onClearPlaylist?.();
          setSelectedUri(null);
          setPlaylist(null);
          tracksRef.current = [];
          setTracks([]);
          setDirty(false);
          setSyncedFingerprint(null);
          setIgnoredRemoteFingerprint(null);
          syncedFingerprintRef.current = null;
          ignoredRemoteFingerprintRef.current = null;
          setRemoteIgnored(false);
          undoRef.current.clear();
          syncUndoFlags();
        }
        return;
      }

      if (selectedUriRef.current !== uri) return;

      // Meta-only: update name without touching tracks.
      try {
        const listed = (playlists || []).find((p) => p.uri === uri);
        let remoteMeta = listed
          ? { name: listed.name, collaborative: listed.collaborative }
          : null;
        if (!remoteMeta) {
          remoteMeta = await MixAppApi.getPlaylistMeta(uri);
        }
        if (remoteMeta?.name && playlistRef.current?.uri === uri) {
          const cur = playlistRef.current;
          if (
            remoteMeta.name !== cur.name ||
            !!remoteMeta.collaborative !== !!cur.collaborative
          ) {
            setPlaylist({
              ...cur,
              name: remoteMeta.name || cur.name,
              collaborative:
                remoteMeta.collaborative != null
                  ? !!remoteMeta.collaborative
                  : cur.collaborative,
              isOwnedBySelf:
                remoteMeta.isOwnedBySelf != null
                  ? !!remoteMeta.isOwnedBySelf
                  : cur.isOwnedBySelf,
              totalLength:
                remoteMeta.totalLength != null
                  ? remoteMeta.totalLength
                  : cur.totalLength,
            });
          }
        }
      } catch (_) {
        /* meta is best-effort */
      }

      const remoteFp = MixAppPlaylistOps.fingerprintTrackOrder(remoteTracks);
      const currentFp = MixAppPlaylistOps.fingerprintTrackOrder(tracksRef.current);
      const baselineFp = syncedFingerprintRef.current;
      const ignoredFp = ignoredRemoteFingerprintRef.current;

      if (dirtyRef.current) {
        // Spotify still matches last sync → local-only edits; leave alone.
        if (baselineFp != null && remoteFp === baselineFp) return;
        // No baseline (legacy session): if remote already equals editor, nothing to do.
        if (baselineFp == null && remoteFp === currentFp) return;
        // Already chose Keep for this remote revision.
        if (ignoredFp != null && remoteFp === ignoredFp) return;

        setSyncConflict({
          kind: "dirty-remote",
          remoteFingerprint: remoteFp,
        });
        return;
      }

      // Clean editor.
      if (remoteFp === currentFp) {
        setSyncedBaseline(tracksRef.current);
        return;
      }

      MixAppApi.notify(MixAppI18n.t("notify.playlistUpdatedFromSpotify"));
      await loadPlaylist(uri, { force: true });
    } finally {
      syncCheckInFlightRef.current = false;
    }
  }

  async function resolveSyncReload() {
    const uri = selectedUriRef.current;
    clearSyncConflict();
    ignoredRemoteFingerprintRef.current = null;
    setRemoteIgnored(false);
    if (!uri) return;
    await loadPlaylist(uri, { force: true });
  }

  function resolveSyncKeep() {
    const conflict = syncConflictRef.current;
    if (conflict?.kind === "dirty-remote" && conflict.remoteFingerprint) {
      ignoredRemoteFingerprintRef.current = conflict.remoteFingerprint;
      setIgnoredRemoteFingerprint(conflict.remoteFingerprint);
      setRemoteIgnored(true);
    } else if (conflict?.kind === "unavailable") {
      // Keep local editor; remote is gone — no fingerprint to ignore.
      setRemoteIgnored(false);
    }
    clearSyncConflict();
  }

  async function resolveSyncOverwrite() {
    const ok = await handleSave();
    if (ok) clearSyncConflict();
  }

  async function resolveSyncSaveAsNew() {
    clearSyncConflict();
    await handleSaveAsNew();
  }

  checkRemoteSyncRef.current = checkRemoteSync;

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
    syncConflict,
    remoteIgnored,
    syncedFingerprint,
    ignoredRemoteFingerprint,
    refreshPlaylists,
    loadPlaylist,
    checkRemoteSync,
    resolveSyncReload,
    resolveSyncKeep,
    resolveSyncOverwrite,
    resolveSyncSaveAsNew,
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
