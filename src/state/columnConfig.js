//@ts-check
/**
 * Playlist column visibility.
 * Spotify-native columns share LocalStorageAPI "column-config" → "playlist-tracklist".
 * MixApp feature columns live under "mixapp-feature-columns".
 */

const MixAppColumnConfig = (() => {
  const STORAGE_KEY = "column-config";
  const SCOPE = "playlist-tracklist";
  const MIXAPP_KEY = "mixapp-feature-columns";

  /** Columns MixApp can show. */
  const COLUMNS = [
    { id: "INDEX", label: "#", always: true },
    { id: "TITLE_AND_ARTIST", label: "Title", always: true },
    { id: "ALBUM", label: "Album", always: false, defaultVisible: true },
    { id: "ADDED_AT", label: "Date added", always: false, defaultVisible: false },
    { id: "BPM", label: "BPM", always: false, defaultVisible: true, feature: true },
    { id: "KEY", label: "Key", always: false, defaultVisible: true, feature: true },
    { id: "ENERGY", label: "Energy", always: false, defaultVisible: true, feature: true, metricId: "energy" },
    { id: "DANCEABILITY", label: "Dance", always: false, defaultVisible: true, feature: true, metricId: "danceability" },
    { id: "VALENCE", label: "Valence", always: false, defaultVisible: false, feature: true, metricId: "valence" },
    { id: "ACOUSTICNESS", label: "Acoustic", always: false, defaultVisible: false, feature: true, metricId: "acousticness" },
    { id: "DURATION", label: "Time", always: false, defaultVisible: true },
    { id: "ACTIONS", label: "Actions", always: true },
  ];

  function isMixAppColumn(col) {
    return !!(col?.feature || col?.mixapp);
  }

  function defaults() {
    /** @type {Record<string, { visible: boolean }>} */
    const out = {};
    for (const col of COLUMNS) {
      out[col.id] = { visible: col.always ? true : !!col.defaultVisible };
    }
    return out;
  }

  function readSpotifyRaw() {
    try {
      const api = Spicetify?.Platform?.LocalStorageAPI;
      if (api?.getItem) {
        const all = api.getItem(STORAGE_KEY);
        if (all && typeof all === "object") return all;
      }
    } catch (err) {
      console.warn("MixApp: column-config read failed", err);
    }
    return {};
  }

  function writeSpotifyRaw(all) {
    try {
      const api = Spicetify?.Platform?.LocalStorageAPI;
      if (api?.setItem) {
        api.setItem(STORAGE_KEY, all);
      }
    } catch (err) {
      console.warn("MixApp: column-config write failed", err);
    }
  }

  function readMixAppRaw() {
    try {
      const api = Spicetify?.Platform?.LocalStorageAPI;
      if (api?.getItem) {
        const all = api.getItem(MIXAPP_KEY);
        if (all && typeof all === "object") return all;
      }
    } catch (err) {
      console.warn("MixApp: feature-columns read failed", err);
    }
    return {};
  }

  function writeMixAppRaw(all) {
    try {
      const api = Spicetify?.Platform?.LocalStorageAPI;
      if (api?.setItem) {
        api.setItem(MIXAPP_KEY, all);
      }
    } catch (err) {
      console.warn("MixApp: feature-columns write failed", err);
    }
  }

  function getVisibility() {
    const base = defaults();
    const scoped = readSpotifyRaw()?.[SCOPE] || {};
    const mix = readMixAppRaw() || {};
    for (const col of COLUMNS) {
      if (col.always) {
        base[col.id] = { visible: true };
        continue;
      }
      if (isMixAppColumn(col)) {
        const entry = mix[col.id];
        if (entry && typeof entry.visible === "boolean") {
          base[col.id] = { visible: entry.visible };
        }
        continue;
      }
      const entry = scoped[col.id];
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

    if (isMixAppColumn(col)) {
      const all = { ...readMixAppRaw() };
      all[columnId] = { visible: !!visible };
      writeMixAppRaw(all);
      return getVisibility();
    }

    const all = { ...readSpotifyRaw() };
    const scoped = { ...(all[SCOPE] || {}) };
    scoped[columnId] = { visible: !!visible };
    all[SCOPE] = scoped;
    writeSpotifyRaw(all);
    return getVisibility();
  }

  function toggle(columnId) {
    const vis = getVisibility();
    return setVisible(columnId, !isVisible(vis, columnId));
  }

  function subscribe(onChange) {
    const api = Spicetify?.Platform?.LocalStorageAPI;
    if (!api) return () => {};

    const handler = () => onChange(getVisibility());

    try {
      if (typeof api.listenToStorageEvents === "function") {
        api.listenToStorageEvents();
      }
      if (typeof api.addListener === "function") {
        api.addListener("update", handler);
        return () => api.removeListener?.("update", handler);
      }
    } catch (err) {
      console.warn("MixApp: column-config subscribe failed", err);
    }

    const timer = setInterval(() => onChange(getVisibility()), 2000);
    return () => clearInterval(timer);
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
    STORAGE_KEY,
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
