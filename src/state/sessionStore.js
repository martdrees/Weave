//@ts-check
/**
 * Persist MixApp working session across Custom App remounts
 * (e.g. open another Spotify view, then return to MixApp).
 *
 * Owns: selectedUri, playlist, tracks, dirty, undo, seedUris, bannedUris,
 *       searchFeatures, searchResults, resultsOpen, searchOpen, statsOpen.
 * Does NOT own: resultLimit, searchFilters (prefs) or columns
 * (MixAppColumnConfig). See docs/PERSISTENCE.md.
 */

const MixAppSession = (() => {
  const KEY = "mixapp-session-v1";
  /** Schema version written on save; raised when stored shape changes. */
  const SCHEMA_VERSION = 2;
  const MAX_UNDO_SNAPSHOTS = 12;

  function storageGet() {
    try {
      const api = Spicetify?.Platform?.LocalStorageAPI;
      if (api?.getItem) {
        const v = api.getItem(KEY);
        if (v != null) return v;
      }
    } catch (err) {
      console.warn("MixApp: session LocalStorageAPI get failed", err);
    }
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn("MixApp: session localStorage get failed", err);
      return null;
    }
  }

  function storageSet(value) {
    try {
      const api = Spicetify?.Platform?.LocalStorageAPI;
      if (api?.setItem) {
        api.setItem(KEY, value);
        return true;
      }
    } catch (err) {
      console.warn("MixApp: session LocalStorageAPI set failed", err);
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn("MixApp: session localStorage set failed", err);
      return false;
    }
  }

  function storageRemove() {
    try {
      const api = Spicetify?.Platform?.LocalStorageAPI;
      if (api?.deleteItem) api.deleteItem(KEY);
      else if (api?.setItem) api.setItem(KEY, null);
    } catch (_) {
      /* ignore */
    }
    try {
      localStorage.removeItem(KEY);
    } catch (_) {
      /* ignore */
    }
  }

  function trimUndo(list) {
    const arr = Array.isArray(list) ? list : [];
    if (arr.length <= MAX_UNDO_SNAPSHOTS) return arr;
    return arr.slice(arr.length - MAX_UNDO_SNAPSHOTS);
  }

  /**
   * Upgrade stored blobs in place. Missing / non-numeric `v` is treated as 1.
   * @returns {{ data: object|null, dirty: boolean }}
   */
  function migrate(raw) {
    if (!raw || typeof raw !== "object") {
      return { data: null, dirty: false };
    }
    const data = { ...raw };
    let version = Number(data.v);
    if (!Number.isFinite(version) || version < 1) version = 1;
    let dirty = false;

    // v1 → v2: resultLimit / searchFilters moved to MixAppPrefs (R4.1).
    if (version < 2) {
      delete data.searchFilters;
      delete data.resultLimit;
      version = 2;
      dirty = true;
    }

    data.v = version;
    return { data, dirty };
  }

  function load() {
    let data = storageGet();
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (_) {
        return null;
      }
    }
    if (!data || typeof data !== "object") return null;

    const { data: migrated, dirty } = migrate(data);
    if (!migrated?.selectedUri || !Array.isArray(migrated.tracks)) return null;

    if (dirty) {
      // Persist cleaned schema so migrate runs once.
      storageSet({ ...migrated, v: SCHEMA_VERSION, savedAt: Date.now() });
    }
    return migrated;
  }

  function save(session) {
    if (!session?.selectedUri) {
      clear();
      return false;
    }
    const payload = {
      v: SCHEMA_VERSION,
      savedAt: Date.now(),
      selectedUri: session.selectedUri,
      playlist: session.playlist || null,
      tracks: Array.isArray(session.tracks) ? session.tracks : [],
      dirty: !!session.dirty,
      seedUris: Array.isArray(session.seedUris) ? session.seedUris : [],
      bannedUris: Array.isArray(session.bannedUris) ? session.bannedUris : [],
      searchFeatures: session.searchFeatures || null,
      searchOpen: !!session.searchOpen,
      statsOpen: !!session.statsOpen,
      resultsOpen: !!session.resultsOpen,
      searchResults: Array.isArray(session.searchResults) ? session.searchResults : [],
      undo: {
        past: trimUndo(session.undo?.past),
        future: trimUndo(session.undo?.future),
      },
    };

    if (storageSet(payload)) return true;

    // Retry without undo / search results if quota is tight
    payload.undo = { past: [], future: [] };
    payload.searchResults = [];
    payload.resultsOpen = false;
    return storageSet(payload);
  }

  function clear() {
    storageRemove();
  }

  return { load, save, clear, KEY, SCHEMA_VERSION, migrate };
})();
