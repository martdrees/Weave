//@ts-check
/**
 * Playlist column visibility — same storage as Spotify’s normal tracklist.
 * Key: LocalStorageAPI "column-config" → "playlist-tracklist"
 */

const MixAppColumnConfig = (() => {
  const STORAGE_KEY = "column-config";
  const SCOPE = "playlist-tracklist";

  /** Columns MixApp can show; ids match Spotify’s $C enum. */
  const COLUMNS = [
    { id: "INDEX", label: "#", always: true },
    { id: "TITLE_AND_ARTIST", label: "Title", always: true },
    { id: "ALBUM", label: "Album", always: false, defaultVisible: true },
    { id: "ADDED_AT", label: "Date added", always: false, defaultVisible: true },
    { id: "BPM", label: "BPM", always: false, defaultVisible: false },
    { id: "KEY", label: "Key", always: false, defaultVisible: false },
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

  function readRaw() {
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

  function writeRaw(all) {
    try {
      const api = Spicetify?.Platform?.LocalStorageAPI;
      if (api?.setItem) {
        api.setItem(STORAGE_KEY, all);
        return;
      }
    } catch (err) {
      console.warn("MixApp: column-config write failed", err);
    }
  }

  /** Merged visibility map for playlist-tracklist. */
  function getVisibility() {
    const base = defaults();
    const scoped = readRaw()?.[SCOPE] || {};
    for (const col of COLUMNS) {
      if (col.always) {
        base[col.id] = { visible: true };
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

    const all = { ...readRaw() };
    const scoped = { ...(all[SCOPE] || {}) };
    scoped[columnId] = { visible: !!visible };
    all[SCOPE] = scoped;
    writeRaw(all);
    return getVisibility();
  }

  function toggle(columnId) {
    const vis = getVisibility();
    return setVisible(columnId, !isVisible(vis, columnId));
  }

  /** Subscribe to LocalStorageAPI updates for column-config. Returns unsubscribe. */
  function subscribe(onChange) {
    const api = Spicetify?.Platform?.LocalStorageAPI;
    if (!api) return () => {};

    const handler = (event) => {
      // Event shapes vary; refresh on any storage bump involving our key.
      const key = event?.key ?? event?.items?.key ?? event;
      if (key === STORAGE_KEY || key == null || typeof key === "object") {
        onChange(getVisibility());
      }
    };

    try {
      if (typeof api.listenToStorageEvents === "function") {
        api.listenToStorageEvents();
      }
      const events = api.getEvents?.();
      if (events?.onUpdate || events?.update || events?.emit) {
        // Platform event emitter: try common names
        const names = ["update", "onUpdate", "change", "storage"];
        for (const name of names) {
          if (typeof events.on === "function") {
            events.on(name, handler);
            return () => events.off?.(name, handler);
          }
        }
      }
      if (typeof api.addListener === "function") {
        api.addListener("update", handler);
        return () => api.removeListener?.("update", handler);
      }
    } catch (err) {
      console.warn("MixApp: column-config subscribe failed", err);
    }

    // Fallback: poll while mounted (cheap; config is tiny)
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

  return {
    STORAGE_KEY,
    SCOPE,
    COLUMNS,
    getVisibility,
    isVisible,
    setVisible,
    toggle,
    subscribe,
    formatAddedAt,
  };
})();
