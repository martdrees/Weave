//@ts-check
/**
 * Playlist column visibility for MixApp.
 * Sole owner of column visibility (not prefs/session). See docs/PERSISTENCE.md.
 *
 * Toggleable columns are stored under LocalStorageAPI "mixapp-feature-columns"
 * (with an in-memory cache) so Spotify’s own column-config cannot overwrite them.
 * On first run, Spotify playlist-tracklist values are used as defaults when present.
 */

const MixAppColumnConfig = (() => {
  const SPOTIFY_KEY = "column-config";
  const SCOPE = "playlist-tracklist";
  const MIXAPP_KEY = "mixapp-feature-columns";

  /** @type {Record<string, { visible: boolean }> | null} */
  let memory = null;

  const COLUMNS = [
    { id: "INDEX", label: "#", always: true },
    { id: "TITLE_AND_ARTIST", label: "Track", always: true },
    { id: "ALBUM", label: "Album (in track)", always: false, defaultVisible: true },
    { id: "ADDED_AT", label: "Date added", always: false, defaultVisible: false },
    { id: "BPM", label: "BPM", always: false, defaultVisible: true },
    { id: "KEY", label: "Key", always: false, defaultVisible: true },
    { id: "ENERGY", label: "Energy", always: false, defaultVisible: true, metricId: "energy" },
    { id: "DANCEABILITY", label: "Dance", always: false, defaultVisible: true, metricId: "danceability" },
    { id: "VALENCE", label: "Valence", always: false, defaultVisible: false, metricId: "valence" },
    { id: "ACOUSTICNESS", label: "Acoustic", always: false, defaultVisible: false, metricId: "acousticness" },
    { id: "DURATION", label: "Time", always: false, defaultVisible: true },
    { id: "ACTIONS", label: "Actions", always: true },
  ];

  function defaults() {
    /** @type {Record<string, { visible: boolean }>} */
    const out = {};
    for (const col of COLUMNS) {
      out[col.id] = { visible: col.always ? true : !!col.defaultVisible };
    }
    return out;
  }

  function readSpotifyScoped() {
    try {
      const api = Spicetify?.Platform?.LocalStorageAPI;
      const all = api?.getItem?.(SPOTIFY_KEY);
      if (all && typeof all === "object") return all[SCOPE] || {};
    } catch {
      /* ignore */
    }
    return {};
  }

  function readPersistedMix() {
    try {
      const api = Spicetify?.Platform?.LocalStorageAPI;
      const all = api?.getItem?.(MIXAPP_KEY);
      if (all && typeof all === "object") return all;
    } catch {
      /* ignore */
    }
    try {
      const raw = localStorage.getItem("mixapp:" + MIXAPP_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return null;
  }

  function writePersistedMix(all) {
    try {
      Spicetify?.Platform?.LocalStorageAPI?.setItem?.(MIXAPP_KEY, all);
    } catch {
      /* ignore */
    }
    try {
      localStorage.setItem("mixapp:" + MIXAPP_KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }

  function ensureMemory() {
    if (memory) return memory;
    const base = defaults();
    const spotify = readSpotifyScoped();
    const saved = readPersistedMix();

    for (const col of COLUMNS) {
      if (col.always) continue;
      // Prefer MixApp-saved prefs; else seed once from Spotify playlist columns.
      const fromMix = saved?.[col.id];
      if (fromMix && typeof fromMix.visible === "boolean") {
        base[col.id] = { visible: fromMix.visible };
        continue;
      }
      const fromSpotify = spotify[col.id];
      if (fromSpotify && typeof fromSpotify.visible === "boolean") {
        base[col.id] = { visible: fromSpotify.visible };
      }
    }

    // Persist only MixApp toggleable entries
    /** @type {Record<string, { visible: boolean }>} */
    const toSave = {};
    for (const col of COLUMNS) {
      if (col.always) continue;
      toSave[col.id] = { visible: !!base[col.id].visible };
    }
    memory = toSave;
    writePersistedMix(toSave);
    return memory;
  }

  function getVisibility() {
    const mix = ensureMemory();
    const base = defaults();
    for (const col of COLUMNS) {
      if (col.always) {
        base[col.id] = { visible: true };
        continue;
      }
      const entry = mix[col.id];
      if (entry && typeof entry.visible === "boolean") {
        base[col.id] = { visible: entry.visible };
      }
    }
    return base;
  }

  function isVisible(visibility, columnId) {
    return !!visibility?.[columnId]?.visible;
  }

  function setVisible(columnId, visible) {
    const col = COLUMNS.find((c) => c.id === columnId);
    if (!col || col.always) return getVisibility();

    const mix = { ...ensureMemory() };
    mix[columnId] = { visible: !!visible };
    memory = mix;
    writePersistedMix(mix);
    return getVisibility();
  }

  function toggle(columnId) {
    const vis = getVisibility();
    return setVisible(columnId, !isVisible(vis, columnId));
  }

  function subscribe(onChange) {
    // No polling — React state is updated directly on toggle.
    // Still listen if Spotify storage changes elsewhere.
    const api = Spicetify?.Platform?.LocalStorageAPI;
    if (!api || typeof api.addListener !== "function") return () => {};
    const handler = () => {
      // Refresh from disk only if we have no memory yet
      if (!memory) onChange(getVisibility());
    };
    try {
      api.listenToStorageEvents?.();
      api.addListener("update", handler);
      return () => api.removeListener?.("update", handler);
    } catch {
      return () => {};
    }
  }

  function formatAddedAt(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "—";
    }
  }

  function columnMetric(columnId) {
    const col = COLUMNS.find((c) => c.id === columnId);
    if (!col?.metricId) return null;
    return MixAppFeatures.METRICS.find((m) => m.id === col.metricId) || null;
  }

  return {
    STORAGE_KEY: MIXAPP_KEY,
    SCOPE,
    MIXAPP_KEY,
    COLUMNS,
    getVisibility,
    isVisible,
    setVisible,
    toggle,
    subscribe,
    formatAddedAt,
    columnMetric,
  };
})();
