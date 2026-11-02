//@ts-check
/**
 * Playlist list/load + write-through edits (live view).
 * Spotify is source of truth; local `tracks` is an optimistic mirror.
 *
 * @param {{
 *   saved: object|null,
 *   onBeforePlaylistLoad?: () => void,
 *   onClearPlaylist?: () => void,
 * }} opts
 */
function WeaveUsePlaylistSession(opts) {
  const react = Spicetify.React;
  const saved = opts?.saved || null;
  const onBeforePlaylistLoad = opts?.onBeforePlaylistLoad;
  const onClearPlaylist = opts?.onClearPlaylist;

  const [playlists, setPlaylists] = react.useState([]);
  const [selectedUri, setSelectedUri] = react.useState(
    () => saved?.selectedUri || null
  );
  const [playlist, setPlaylist] = react.useState(() => saved?.playlist || null);
  /** Always start empty — refetch from Spotify (no restored draft order). */
  const [tracks, setTracks] = react.useState([]);
  const [listLoading, setListLoading] = react.useState(true);
  const [tracksLoading, setTracksLoading] = react.useState(false);
  const [saving, setSaving] = react.useState(false);
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
  /** Synchronous write lock — React `saving` alone cannot block double actions. */
  const savingRef = react.useRef(false);
  /** Count of in-flight add/remove/move/bulk writes (focus reload skips while > 0). */
  const writeInFlightRef = react.useRef(0);
  /** Provisional uids with an in-flight addTracks write-through. */
  const pendingAddUidsRef = react.useRef(new Set());
  const tracksRef = react.useRef(tracks);
  tracksRef.current = tracks;
  const playlistRef = react.useRef(playlist);
  playlistRef.current = playlist;
  const syncCheckInFlightRef = react.useRef(false);
  const lastSyncCheckAtRef = react.useRef(0);
  /** Last known Spotify order fingerprint for the open playlist. */
  const lastRemoteFingerprintRef = react.useRef(/** @type {string|null} */ (null));

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

  function setLastRemoteFingerprint(trackList) {
    lastRemoteFingerprintRef.current =
      WeavePlaylistOps.fingerprintTrackOrder(trackList) || null;
  }

  function beginWrite() {
    writeInFlightRef.current += 1;
  }

  function endWrite() {
    writeInFlightRef.current = Math.max(0, writeInFlightRef.current - 1);
  }

  async function refreshPlaylists() {
    setListLoading(true);
    setError(null);
    try {
      const items = await WeaveApi.listPlaylists();
      items.sort((a, b) => a.name.localeCompare(b.name));
      setPlaylists(items);
    } catch (err) {
      console.error(err);
      setError(err?.message || WeaveI18n.t("notify.failedPlaylists"));
      WeaveApi.notify(WeaveI18n.t("notify.failedPlaylists"), true);
    } finally {
      setListLoading(false);
    }
    await checkRemoteSync({ reason: "refresh" });
  }

  react.useEffect(() => {
    refreshPlaylists();
    // Mount only (intentional deps omission).
  }, []);

  // Restore selected playlist by refetching Spotify (never trust cached tracks).
  react.useEffect(() => {
    if (!selectedUri) return;
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
      lastRemoteFingerprintRef.current = null;
      WeaveSession.clear();
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

      const items = await WeaveApi.getPlaylistTracks(uri);
      if (loadGen !== loadGenRef.current) return;

      if (!meta) {
        meta = await WeaveApi.getPlaylistMeta(uri);
        if (loadGen !== loadGenRef.current) return;
      } else if (listed?.canEdit === false) {
        meta.isOwnedBySelf = false;
        meta.collaborative = false;
      }

      setPlaylist(meta);
      setTracks(items);
      tracksRef.current = items;
      setLastRemoteFingerprint(items);
      setTracksLoading(false);
      try {
        const enriched = await WeaveFeatures.enrichTracks(items.slice());
        if (loadGen !== loadGenRef.current) return;
        // Merge features into whatever the user currently has — never hard-replace
        // after enrich, or mid-load reorders/adds are wiped.
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
        WeavePlaylists?.isPlaylistUnavailableError?.(err);
      const rateLimited = !unavailable && WeaveHttp?.isRateLimitError?.(err);
      const msg = unavailable
        ? WeaveI18n.t("notify.playlistUnavailable")
        : rateLimited
          ? WeaveI18n.t("notify.rateLimit")
          : err?.message || WeaveI18n.t("notify.failedPlaylist");
      if (!unavailable) console.error(err);
      else console.warn("Weave: playlist unavailable", err);
      setError(msg);
      WeaveApi.notify(msg, true);
      setPlaylist(null);
      setTracks([]);
      if (unavailable && uri) {
        WeavePlaylists?.markPlaylistUnavailable?.(uri);
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

  /** Local list update (optimistic mirror; no draft/dirty). */
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
   * @param {WeaveTrackRow[]} priorTracks
   * @param {WeaveTrackRow[]} added
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
    beginWrite();
    try {
      const remote = await WeaveApi.addTracks(uri, uris, { after: "end" });
      if (selectedUriRef.current !== uri) return;
      const merged = WeavePlaylistOps.mergeTracksAfterRemoteAdd(
        tracksRef.current,
        remote
      );
      replaceTracksLocal(merged);
      setLastRemoteFingerprint(merged);
      const uriSet = new Set(uris);
      WeavePlaylistOps.enrichAdded(
        merged.filter((t) => t?.uri && uriSet.has(t.uri)),
        setTracks
      );
    } catch (err) {
      console.error(err);
      if (selectedUriRef.current === uri) {
        replaceTracksLocal(priorTracks);
        WeaveApi.notify(err?.message || WeaveI18n.t("notify.addFailed"), true);
      }
    } finally {
      for (const id of pendingUids) pendingAddUidsRef.current.delete(id);
      endWrite();
    }
  }

  /**
   * Persist optimistic remove via mutation port; restore row on failure.
   * @param {WeaveTrackRow[]} priorTracks
   * @param {WeaveTrackRow} removed
   * @param {number} index
   */
  async function persistRemovedTrack(priorTracks, removed, index) {
    const uri = playlistRef.current?.uri;
    if (!uri || !removed?.uri || !removed?.uid) return;
    beginWrite();
    try {
      await WeaveApi.removeTracks(uri, [
        { uri: String(removed.uri), uid: String(removed.uid) },
      ]);
      if (selectedUriRef.current !== uri) return;
      setLastRemoteFingerprint(tracksRef.current);
    } catch (err) {
      console.error(err);
      if (selectedUriRef.current === uri) {
        const cur = tracksRef.current.slice();
        const at = Math.max(0, Math.min(index, cur.length));
        cur.splice(at, 0, removed);
        replaceTracksLocal(cur);
        WeaveApi.notify(err?.message || WeaveI18n.t("notify.removeFailed"), true);
      }
    } finally {
      endWrite();
    }
  }

  /**
   * Persist optimistic single-row reorder; restore prior order on failure.
   * @param {WeaveTrackRow[]} priorTracks
   * @param {WeaveTrackRow} moved
   * @param {number} toIndex final 0-based index after the move
   */
  async function persistMovedTrack(priorTracks, moved, toIndex) {
    const uri = playlistRef.current?.uri;
    if (!uri || !moved?.uri || !moved?.uid) return;
    beginWrite();
    try {
      await WeaveApi.moveTrack(
        uri,
        { uri: String(moved.uri), uid: String(moved.uid) },
        { index: toIndex }
      );
      if (selectedUriRef.current !== uri) return;
      setLastRemoteFingerprint(tracksRef.current);
    } catch (err) {
      console.error(err);
      if (selectedUriRef.current === uri) {
        replaceTracksLocal(priorTracks);
        WeaveApi.notify(err?.message || WeaveI18n.t("notify.reorderFailed"), true);
      }
    } finally {
      endWrite();
    }
  }

  function handleReorder(from, to) {
    if (savingRef.current || tracksLoadingRef.current) return;
    // Serialize with in-flight add/move so Platform/Web reorder sees fresh live order.
    if (writeInFlightRef.current > 0) {
      WeaveApi.notify(WeaveI18n.t("notify.waitAddBeforeReorder"), true);
      return;
    }
    if (from === to) return;
    const list = tracksRef.current;
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from < 0 ||
      to < 0 ||
      from >= list.length ||
      to >= list.length
    ) {
      return;
    }
    const moved = list[from];
    if (!moved) return;

    const prior = list.slice();
    const next = list.slice();
    next.splice(from, 1);
    next.splice(to, 0, moved);

    // Non-writable: local mirror only (Save as new can still copy order).
    if (!canWriteThroughPlaylist()) {
      replaceTracksLocal(next);
      return;
    }

    if (
      WeavePlaylistOps.isProvisionalPlaylistUid(moved.uid) ||
      pendingAddUidsRef.current.has(String(moved.uid))
    ) {
      WeaveApi.notify(WeaveI18n.t("notify.waitAddBeforeReorder"), true);
      return;
    }
    if (!moved.uri || !moved.uid) return;

    replaceTracksLocal(next);
    void persistMovedTrack(prior, moved, to);
  }

  function handleRemoveTrack(index, track) {
    if (savingRef.current) return null;
    if (!canWriteThroughPlaylist()) {
      if (playlistRef.current?.uri) {
        WeaveApi.notify(WeaveI18n.t("notify.cannotEditPlaylist"), true);
      }
      return null;
    }
    const list = tracksRef.current;
    if (index == null || index < 0 || index >= list.length) return null;
    const removed = track || list[index];
    if (!removed) return null;

    if (WeavePlaylistOps.isProvisionalPlaylistUid(removed.uid)) {
      if (pendingAddUidsRef.current.has(String(removed.uid))) {
        WeaveApi.notify(WeaveI18n.t("notify.waitAddBeforeRemove"), true);
        return null;
      }
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

  /**
   * Create a new playlist from current tracks or an explicit list (Flowify preview).
   * @param {{ tracks?: WeaveTrackRow[], stayOnCurrent?: boolean }} [opts]
   * @returns {Promise<boolean>}
   */
  async function handleSaveAsNew(opts) {
    // Toolbar passes a click event; only treat plain option objects as opts.
    const options =
      opts &&
      typeof opts === "object" &&
      !opts.nativeEvent &&
      (Array.isArray(opts.tracks) || typeof opts.stayOnCurrent === "boolean")
        ? opts
        : null;
    const source =
      Array.isArray(options?.tracks) && options.tracks.length
        ? options.tracks
        : tracksRef.current;
    if (!source.length) return false;
    if (tracksLoadingRef.current || savingRef.current) return false;
    const stayOnCurrent = !!options?.stayOnCurrent;
    const base = playlist?.name || WeaveI18n.t("playlist.defaultName");
    const name = WeaveI18n.t("playlist.weaveSuffix", { name: base });
    const uris = source.map((t) => t.uri).filter(Boolean);
    if (!uris.length) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      if (tracksLoadingRef.current) {
        WeaveApi.notify(WeaveI18n.t("notify.cannotSaveLoading"), true);
        return false;
      }
      const uri = await WeaveApi.createPlaylist(name, uris);
      WeaveApi.notify(WeaveI18n.t("notify.created", { name }));
      await refreshPlaylists();
      if (!stayOnCurrent) await loadPlaylist(uri);
      return true;
    } catch (err) {
      console.error(err);
      WeaveApi.notify(err?.message || WeaveI18n.t("notify.createFailed"), true);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  /**
   * Flowify Apply bridge: one applyBulk commit (no draft Save).
   * @param {WeaveTrackRow[]} nextTracks
   * @returns {Promise<boolean>}
   */
  async function handleApplyBulk(nextTracks) {
    const uri = playlistRef.current?.uri;
    if (!uri || !Array.isArray(nextTracks) || !nextTracks.length) return false;
    if (!canWriteThroughPlaylist()) {
      WeaveApi.notify(WeaveI18n.t("notify.cannotEditPlaylist"), true);
      return false;
    }
    if (savingRef.current) return false;
    const prior = tracksRef.current.slice();
    replaceTracksLocal(nextTracks);
    flashList();
    savingRef.current = true;
    setSaving(true);
    beginWrite();
    try {
      const savedTracks = await WeaveApi.applyBulk(uri, nextTracks);
      if (selectedUriRef.current !== uri) return true;
      let baseline = nextTracks;
      if (Array.isArray(savedTracks) && savedTracks.length) {
        const byUri = new Map();
        for (const t of nextTracks) {
          if (!t?.uri) continue;
          if (!byUri.has(t.uri)) byUri.set(t.uri, []);
          byUri.get(t.uri).push(t);
        }
        baseline = savedTracks.map((t) => {
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
        replaceTracksLocal(baseline);
      }
      setLastRemoteFingerprint(baseline);
      WeaveApi.notify(WeaveI18n.t("notify.flowifyApplied"));
      return true;
    } catch (err) {
      console.error(err);
      if (selectedUriRef.current === uri) {
        replaceTracksLocal(prior);
        WeaveApi.notify(err?.message || WeaveI18n.t("notify.flowifyApplyFailed"), true);
      }
      return false;
    } finally {
      endWrite();
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleAddCatalogTrack(track) {
    if (!canWriteThroughPlaylist()) {
      if (playlistRef.current?.uri) {
        WeaveApi.notify(WeaveI18n.t("notify.cannotEditPlaylist"), true);
      }
      return;
    }
    const prior = tracksRef.current.slice();
    const { next, added } = WeavePlaylistOps.appendTracks(prior, [track]);
    if (!added.length) {
      WeaveApi.notify(WeaveI18n.t("notify.alreadyInPlaylist"), true);
      return;
    }
    replaceTracksLocal(next);
    flashRows(added.map((t) => t.uid || t.uri));
    // No success toast — Spotify already notifies on playlist add.
    WeavePlaylistOps.enrichAdded(added, setTracks);
    void persistAddedTracks(prior, added);
  }

  function handleAddCatalogTracks(batch) {
    if (!canWriteThroughPlaylist()) {
      if (playlistRef.current?.uri) {
        WeaveApi.notify(WeaveI18n.t("notify.cannotEditPlaylist"), true);
      }
      return;
    }
    const prior = tracksRef.current.slice();
    const { next, added } = WeavePlaylistOps.appendTracks(prior, batch);
    if (!added.length) {
      WeaveApi.notify(WeaveI18n.t("notify.noNewTracks"), true);
      return;
    }
    replaceTracksLocal(next);
    flashRows(added.map((t) => t.uid || t.uri));
    WeavePlaylistOps.enrichAdded(added, setTracks);
    void persistAddedTracks(prior, added);
  }

  /** Add a rec result track; returns true if added optimistically. */
  function handleAddRecommendedTrack(track) {
    if (!canWriteThroughPlaylist()) {
      if (playlistRef.current?.uri) {
        WeaveApi.notify(WeaveI18n.t("notify.cannotEditPlaylist"), true);
      }
      return false;
    }
    const prior = tracksRef.current.slice();
    const { next, added } = WeavePlaylistOps.appendTracks(prior, [track]);
    if (!added.length) {
      WeaveApi.notify(WeaveI18n.t("notify.alreadyInPlaylist"), true);
      return false;
    }
    replaceTracksLocal(next);
    flashRows(added.map((t) => t.uid || t.uri));
    WeavePlaylistOps.enrichAdded(added, setTracks);
    void persistAddedTracks(prior, added);
    return true;
  }

  /**
   * Compare the open playlist to Spotify (membership + order).
   * On drift: reload + toast. Skips while loading or writes in flight.
   */
  async function checkRemoteSync(opts) {
    const reason = opts?.reason || "auto";
    const uri = selectedUriRef.current;
    if (!uri) return;
    if (!playlistRef.current && !tracksRef.current.length) return;
    if (tracksLoadingRef.current || savingRef.current) return;
    if (writeInFlightRef.current > 0) return;
    if (syncCheckInFlightRef.current) return;
    const now = Date.now();
    if (reason !== "refresh" && now - lastSyncCheckAtRef.current < 2000) return;

    syncCheckInFlightRef.current = true;
    lastSyncCheckAtRef.current = now;
    try {
      let remoteTracks;
      try {
        remoteTracks = await WeaveApi.getPlaylistTracks(uri);
      } catch (err) {
        if (selectedUriRef.current !== uri) return;
        const unavailable =
          err?.code === "PLAYLIST_UNAVAILABLE" ||
          WeavePlaylists?.isPlaylistUnavailableError?.(err);
        if (!unavailable) {
          console.warn("Weave: remote sync check failed", err);
          return;
        }
        WeaveApi.notify(WeaveI18n.t("notify.playlistUnavailable"), true);
        WeavePlaylists?.markPlaylistUnavailable?.(uri);
        setPlaylists((prev) => (prev || []).filter((p) => p.uri !== uri));
        onClearPlaylist?.();
        setSelectedUri(null);
        setPlaylist(null);
        tracksRef.current = [];
        setTracks([]);
        lastRemoteFingerprintRef.current = null;
        return;
      }

      if (selectedUriRef.current !== uri) return;

      try {
        const listed = (playlists || []).find((p) => p.uri === uri);
        let remoteMeta = listed
          ? { name: listed.name, collaborative: listed.collaborative }
          : null;
        if (!remoteMeta) {
          remoteMeta = await WeaveApi.getPlaylistMeta(uri);
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

      const remoteFp = WeavePlaylistOps.fingerprintTrackOrder(remoteTracks);
      const baselineFp = lastRemoteFingerprintRef.current;
      const currentFp = WeavePlaylistOps.fingerprintTrackOrder(tracksRef.current);

      if (baselineFp != null && remoteFp === baselineFp) return;
      if (baselineFp == null && remoteFp === currentFp) {
        setLastRemoteFingerprint(tracksRef.current);
        return;
      }

      WeaveApi.notify(WeaveI18n.t("notify.playlistUpdatedFromSpotify"));
      await loadPlaylist(uri, { force: true });
    } finally {
      syncCheckInFlightRef.current = false;
    }
  }

  checkRemoteSyncRef.current = checkRemoteSync;

  /** Live mirror for playback (avoids stale React closures). */
  function getTracks() {
    return tracksRef.current;
  }

  /**
   * True while a row still has a Weave-synthetic uid or an in-flight add.
   * @param {WeaveTrackRow|null|undefined} track
   */
  function isTrackPlayPending(track) {
    if (!track) return false;
    if (WeavePlaylistOps.isProvisionalPlaylistUid(track.uid)) return true;
    return pendingAddUidsRef.current.has(String(track.uid));
  }

  /**
   * Wait until add write-through attaches a real Spotify item uid (or timeout).
   * @param {string} uri
   * @param {number} [timeoutMs]
   * @returns {Promise<WeaveTrackRow|null>}
   */
  async function waitForReadyTrack(uri, timeoutMs) {
    if (!uri) return null;
    const limit = typeof timeoutMs === "number" ? timeoutMs : 2000;
    const started = Date.now();
    while (Date.now() - started < limit) {
      const row = tracksRef.current.find((t) => t?.uri === uri) || null;
      if (row && !isTrackPlayPending(row)) return row;
      await new Promise((r) => setTimeout(r, 80));
    }
    return tracksRef.current.find((t) => t?.uri === uri) || null;
  }

  return {
    playlists,
    selectedUri,
    playlist,
    tracks,
    listLoading,
    tracksLoading,
    saving,
    error,
    rowFlashUids,
    listFlashKey,
    refreshPlaylists,
    loadPlaylist,
    checkRemoteSync,
    flashRows,
    flashList,
    getTracks,
    isTrackPlayPending,
    waitForReadyTrack,
    handleReorder,
    handleRemoveTrack,
    handleSaveAsNew,
    handleApplyBulk,
    handleAddCatalogTrack,
    handleAddCatalogTracks,
    handleAddRecommendedTrack,
  };
}
