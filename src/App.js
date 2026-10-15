//@ts-check

function MixAppPage() {
  const react = Spicetify.React;
  const undoRef = react.useRef(null);
  if (!undoRef.current) {
    undoRef.current = MixAppCreateUndoStack(40);
  }

  const [playlists, setPlaylists] = react.useState([]);
  const [selectedUri, setSelectedUri] = react.useState(null);
  const [playlist, setPlaylist] = react.useState(null);
  const [tracks, setTracks] = react.useState([]);
  const [listLoading, setListLoading] = react.useState(true);
  const [tracksLoading, setTracksLoading] = react.useState(false);
  const [dirty, setDirty] = react.useState(false);
  const [saving, setSaving] = react.useState(false);
  const [canUndo, setCanUndo] = react.useState(false);
  const [canRedo, setCanRedo] = react.useState(false);
  const [error, setError] = react.useState(null);

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
      setError(err?.message || "Failed to load playlists");
      MixAppApi.notify("Failed to load playlists", true);
    } finally {
      setListLoading(false);
    }
  }

  react.useEffect(() => {
    refreshPlaylists();
  }, []);

  async function loadPlaylist(uri) {
    if (!uri) {
      setSelectedUri(null);
      setPlaylist(null);
      setTracks([]);
      setDirty(false);
      undoRef.current.clear();
      syncUndoFlags();
      return;
    }

    setSelectedUri(uri);
    setTracksLoading(true);
    setError(null);
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
      // Key / BPM from spclient audio-attributes (standard letter keys by default)
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

  function handlePlay(track, index) {
    try {
      const uris = tracks.map((t) => t.uri).filter(Boolean);
      if (Spicetify?.Player?.playUri && track?.uri) {
        // Prefer playing context from this track when possible
        Spicetify.Player.playUri(track.uri);
        return;
      }
      if (Spicetify?.Platform?.PlayerAPI?.play) {
        Spicetify.Platform.PlayerAPI.play(
          { uri: track.uri },
          {},
          { skipToUri: track.uri }
        );
        return;
      }
      if (uris.length && Spicetify?.Platform?.PlayerAPI?.play) {
        Spicetify.Platform.PlayerAPI.play(
          { uri: playlist?.uri },
          {},
          { skipToIndex: index }
        );
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
        "Load a playlist, reorder tracks, undo changes, and save back to Spotify."
      )
    ),
    react.createElement(MixAppPlaylistPicker, {
      playlists,
      selectedUri,
      loading: listLoading,
      onSelect: loadPlaylist,
      onRefresh: refreshPlaylists,
    }),
    react.createElement(MixAppToolbar, {
      playlist,
      tracks,
      dirty,
      canUndo,
      canRedo,
      saving,
      onUndo: handleUndo,
      onRedo: handleRedo,
      onSave: handleSave,
      onSaveAsNew: handleSaveAsNew,
    }),
    error
      ? react.createElement("div", { className: "mixapp-error" }, error)
      : null,
    react.createElement(MixAppArranger, {
      tracks,
      loading: tracksLoading,
      onReorder: handleReorder,
      onPlay: handlePlay,
    }),
    playlist
      ? react.createElement(
          "p",
          { className: "mixapp-footer-hint" },
          `${tracks.length} tracks`,
          dirty ? " · local changes not saved" : ""
        )
      : null
  );
}
