/**
 * Durable Weave UI prefs (survive playlist changes / session clear).
 *
 * Owns: resultLimit, searchFilters, preferSearchOpen, preferStatsOpen,
 *       flowify, generator, statsVisibleMetrics.
 * Does NOT own: tracks/undo/seeds/results (session) or column visibility
 * (columnConfig). See docs/PERSISTENCE.md.
 */

export const KEY = "weave-prefs-v1";
/** Pre-rename key — read once and rewrite under KEY. */
export const LEGACY_KEY = "mixapp-prefs-v1";
/** Schema version written on save; raised when stored shape changes. */
export const SCHEMA_VERSION = 2;

export type SearchFilters = {
  hideExisting: boolean;
  hideExistingArtists: boolean;
  excludeExplicit: boolean;
  excludeAberrant: boolean;
  yearMin: string;
  yearMax: string;
  camelotMoves: string[];
};

export type GeneratorPrefs = {
  limit: number;
  flowifyAfter: boolean;
  excludeExplicit: boolean;
  excludeAberrant: boolean;
};

export type PrefsState = {
  resultLimit: number;
  searchFilters: SearchFilters;
  flowify: Record<string, unknown> | null;
  generator: GeneratorPrefs;
  preferStatsOpen: boolean;
  preferSearchOpen: boolean;
  statsVisibleMetrics: string[] | null;
};

export function defaults(): PrefsState {
  return {
    resultLimit: 100,
    searchFilters: {
      hideExisting: true,
      hideExistingArtists: false,
      excludeExplicit: false,
      excludeAberrant: true,
      yearMin: "",
      yearMax: "",
      camelotMoves: [],
    },
    flowify: null,
    generator: {
      limit: 40,
      flowifyAfter: true,
      excludeExplicit: false,
      excludeAberrant: true,
    },
    preferStatsOpen: false,
    preferSearchOpen: false,
    statsVisibleMetrics: null,
  };
}

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
    console.warn("Weave: prefs LocalStorageAPI get failed", err);
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
    console.warn("Weave: prefs localStorage get failed", err);
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
    console.warn("Weave: prefs LocalStorageAPI set failed", err);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn("Weave: prefs localStorage set failed", err);
    return false;
  }
}

/** Upgrade stored blobs in place. Missing / non-numeric `v` is treated as 1. */
export function migrate(raw: unknown): {
  data: Record<string, unknown>;
  dirty: boolean;
} {
  if (!raw || typeof raw !== "object") {
    return { data: {}, dirty: false };
  }
  const data = { ...(raw as Record<string, unknown>) };
  let version = Number(data.v);
  if (!Number.isFinite(version) || version < 1) version = 1;
  let dirty = false;

  // v1 → v2: prefs saved before Abs. Aggregate chart — turn it on once.
  if (version < 2) {
    const metrics = data.statsVisibleMetrics;
    if (Array.isArray(metrics) && metrics.length && !metrics.includes("aggChange")) {
      data.statsVisibleMetrics = ["aggChange"].concat(metrics as string[]);
    }
    version = 2;
    dirty = true;
  }

  data.v = version;
  return { data, dirty };
}

export function normalize(raw: unknown): PrefsState {
  const base = defaults();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, any>;
  const filters: SearchFilters = {
    ...base.searchFilters,
    ...(r.searchFilters || {}),
  };
  filters.camelotMoves = Array.isArray(filters.camelotMoves)
    ? filters.camelotMoves
    : [];
  const generator: GeneratorPrefs = {
    ...base.generator,
    ...(r.generator || {}),
  };
  return {
    resultLimit:
      Number(r.resultLimit) > 0
        ? Math.min(200, Number(r.resultLimit))
        : base.resultLimit,
    searchFilters: filters,
    flowify: r.flowify && typeof r.flowify === "object" ? r.flowify : null,
    generator,
    preferStatsOpen: !!r.preferStatsOpen,
    preferSearchOpen: !!r.preferSearchOpen,
    statsVisibleMetrics: Array.isArray(r.statsVisibleMetrics)
      ? r.statsVisibleMetrics.filter((id: unknown) => typeof id === "string")
      : null,
  };
}

export function load(): PrefsState {
  let data: unknown = storageGet();
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return defaults();
    }
  }
  if (!data || typeof data !== "object") return defaults();

  const { data: migrated, dirty } = migrate(data);
  const next = normalize(migrated);
  if (dirty) {
    storageSet({ v: SCHEMA_VERSION, savedAt: Date.now(), ...next });
  }
  return next;
}

export function save(partial?: Partial<PrefsState> | null): PrefsState {
  const next = normalize({ ...load(), ...(partial || {}) });
  storageSet({ v: SCHEMA_VERSION, savedAt: Date.now(), ...next });
  return next;
}

export function patch(partial?: Partial<PrefsState> | null): PrefsState {
  return save(partial);
}
