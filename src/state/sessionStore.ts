/**
 * Persist Weave working session across Custom App remounts.
 *
 * Owns: selectedUri, playlist meta, seedUris, bannedUris, searchFeatures,
 *       searchResults, resultsOpen, searchOpen, statsOpen.
 * Does NOT own: tracks/dirty/undo (live view — refetch tracks),
 *       resultLimit / searchFilters (prefs), or columns (columnConfig).
 * See docs/PERSISTENCE.md.
 */

export const KEY = "weave-session-v1";
/** Pre-rename key — read once and rewrite under KEY. */
export const LEGACY_KEY = "mixapp-session-v1";
/** Schema version written on save; raised when stored shape changes. */
export const SCHEMA_VERSION = 4;

export type SessionPayload = {
  v: number;
  savedAt?: number;
  selectedUri: string;
  playlist?: unknown;
  seedUris?: string[];
  bannedUris?: string[];
  searchFeatures?: unknown;
  searchOpen?: boolean;
  statsOpen?: boolean;
  resultsOpen?: boolean;
  searchResults?: unknown[];
  [key: string]: unknown;
};

function storageGet(): unknown {
  try {
    const api = Spicetify?.Platform?.LocalStorageAPI;
    if (api?.getItem) {
      const v = api.getItem(KEY);
      if (v != null) return v;
      const legacy = api.getItem(LEGACY_KEY);
      if (legacy != null) {
        try {
          api.setItem(KEY, legacy);
          api.deleteItem?.(LEGACY_KEY);
        } catch {
          /* ignore migrate write */
        }
        return legacy;
      }
    }
  } catch (err) {
    console.warn("Weave: session LocalStorageAPI get failed", err);
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return null;
    const parsed = JSON.parse(legacyRaw);
    try {
      localStorage.setItem(KEY, legacyRaw);
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore migrate write */
    }
    return parsed;
  } catch (err) {
    console.warn("Weave: session localStorage get failed", err);
    return null;
  }
}

function storageSet(value: unknown): boolean {
  try {
    const api = Spicetify?.Platform?.LocalStorageAPI;
    if (api?.setItem) {
      api.setItem(KEY, value);
      return true;
    }
  } catch (err) {
    console.warn("Weave: session LocalStorageAPI set failed", err);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn("Weave: session localStorage set failed", err);
    return false;
  }
}

function storageRemove(): void {
  try {
    const api = Spicetify?.Platform?.LocalStorageAPI;
    if (api?.deleteItem) api.deleteItem(KEY);
    else if (api?.setItem) api.setItem(KEY, null);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Strip draft-era fields (tracks, dirty, undo, sync fingerprints). */
function stripDraftFields(data: Record<string, unknown>): void {
  delete data.tracks;
  delete data.dirty;
  delete data.undo;
  delete data.syncedFingerprint;
  delete data.ignoredRemoteFingerprint;
}

/**
 * Upgrade stored blobs in place. Missing / non-numeric `v` is treated as 1.
 */
export function migrate(raw: unknown): {
  data: SessionPayload | null;
  dirty: boolean;
} {
  if (!raw || typeof raw !== "object") {
    return { data: null, dirty: false };
  }
  const data = { ...(raw as Record<string, unknown>) };
  let version = Number(data.v);
  if (!Number.isFinite(version) || version < 1) version = 1;
  let dirty = false;

  // v1 → v2: resultLimit / searchFilters moved to prefs (R4.1).
  if (version < 2) {
    delete data.searchFilters;
    delete data.resultLimit;
    version = 2;
    dirty = true;
  }

  // v2 → v3: last-synced / ignored-remote fingerprints (legacy; removed in v4).
  if (version < 3) {
    version = 3;
    dirty = true;
  }

  // v3 → v4: live view — drop draft tracks/dirty/undo/fingerprints.
  if (version < 4) {
    stripDraftFields(data);
    version = 4;
    dirty = true;
  } else if (
    "tracks" in data ||
    "dirty" in data ||
    "undo" in data ||
    "syncedFingerprint" in data ||
    "ignoredRemoteFingerprint" in data
  ) {
    stripDraftFields(data);
    dirty = true;
  }

  data.v = version;
  return { data: data as SessionPayload, dirty };
}

export function load(): SessionPayload | null {
  let data: unknown = storageGet();
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;

  const { data: migrated, dirty } = migrate(data);
  if (!migrated?.selectedUri) return null;

  if (dirty) {
    storageSet({ ...migrated, v: SCHEMA_VERSION, savedAt: Date.now() });
  }
  return migrated;
}

export function save(
  session: {
    selectedUri?: string | null;
    playlist?: unknown;
    seedUris?: unknown;
    bannedUris?: unknown;
    searchFeatures?: unknown;
    searchOpen?: boolean;
    statsOpen?: boolean;
    resultsOpen?: boolean;
    searchResults?: unknown;
  } | null
): boolean {
  if (!session?.selectedUri) {
    clear();
    return false;
  }
  const payload: SessionPayload = {
    v: SCHEMA_VERSION,
    savedAt: Date.now(),
    selectedUri: session.selectedUri,
    playlist: session.playlist || null,
    seedUris: Array.isArray(session.seedUris) ? (session.seedUris as string[]) : [],
    bannedUris: Array.isArray(session.bannedUris)
      ? (session.bannedUris as string[])
      : [],
    searchFeatures: session.searchFeatures || null,
    searchOpen: !!session.searchOpen,
    statsOpen: !!session.statsOpen,
    resultsOpen: !!session.resultsOpen,
    searchResults: Array.isArray(session.searchResults) ? session.searchResults : [],
  };

  if (storageSet(payload)) return true;

  // Retry without search results if quota is tight
  payload.searchResults = [];
  payload.resultsOpen = false;
  return storageSet(payload);
}

export function clear(): void {
  storageRemove();
}
