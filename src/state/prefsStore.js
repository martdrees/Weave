//@ts-check
/**
 * Durable MixApp UI prefs (survive playlist changes / session clear).
 *
 * Owns: resultLimit, searchFilters, preferSearchOpen, preferStatsOpen,
 *       flowify, generator, statsVisibleMetrics.
 * Does NOT own: tracks/undo/seeds/results (session) or column visibility
 * (MixAppColumnConfig). See docs/PERSISTENCE.md.
 */

const MixAppPrefs = (() => {
  const KEY = "mixapp-prefs-v1";
  /** Schema version written on save; raised when stored shape changes. */
  const SCHEMA_VERSION = 2;

  function defaults() {
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
      /** Remember last open panels across remounts when no session tracks. */
      preferStatsOpen: false,
      preferSearchOpen: false,
      /** Metric ids shown in the Stats panel (null = all). */
      statsVisibleMetrics: null,
    };
  }

  function storageGet() {
    try {
      const api = Spicetify?.Platform?.LocalStorageAPI;
      if (api?.getItem) {
        const v = api.getItem(KEY);
        if (v != null) return v;
      }
    } catch (err) {
      console.warn("MixApp: prefs LocalStorageAPI get failed", err);
    }
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn("MixApp: prefs localStorage get failed", err);
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
      console.warn("MixApp: prefs LocalStorageAPI set failed", err);
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn("MixApp: prefs localStorage set failed", err);
      return false;
    }
  }

  /**
   * Upgrade stored blobs in place. Missing / non-numeric `v` is treated as 1.
   * @returns {{ data: object, dirty: boolean }}
   */
  function migrate(raw) {
    if (!raw || typeof raw !== "object") {
      return { data: {}, dirty: false };
    }
    const data = { ...raw };
    let version = Number(data.v);
    if (!Number.isFinite(version) || version < 1) version = 1;
    let dirty = false;

    // v1 → v2: prefs saved before Abs. Aggregate chart — turn it on once.
    if (version < 2) {
      const metrics = data.statsVisibleMetrics;
      if (
        Array.isArray(metrics) &&
        metrics.length &&
        !metrics.includes("aggChange")
      ) {
        data.statsVisibleMetrics = ["aggChange"].concat(metrics);
      }
      version = 2;
      dirty = true;
    }

    data.v = version;
    return { data, dirty };
  }

  function normalize(raw) {
    const base = defaults();
    if (!raw || typeof raw !== "object") return base;
    const filters = {
      ...base.searchFilters,
      ...(raw.searchFilters || {}),
    };
    filters.camelotMoves = Array.isArray(filters.camelotMoves)
      ? filters.camelotMoves
      : [];
    const generator = {
      ...base.generator,
      ...(raw.generator || {}),
    };
    return {
      resultLimit:
        Number(raw.resultLimit) > 0
          ? Math.min(200, Number(raw.resultLimit))
          : base.resultLimit,
      searchFilters: filters,
      flowify:
        raw.flowify && typeof raw.flowify === "object" ? raw.flowify : null,
      generator,
      preferStatsOpen: !!raw.preferStatsOpen,
      preferSearchOpen: !!raw.preferSearchOpen,
      statsVisibleMetrics: Array.isArray(raw.statsVisibleMetrics)
        ? raw.statsVisibleMetrics.filter((id) => typeof id === "string")
        : null,
    };
  }

  function load() {
    let data = storageGet();
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (_) {
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

  function save(partial) {
    const next = normalize({ ...load(), ...(partial || {}) });
    storageSet({ v: SCHEMA_VERSION, savedAt: Date.now(), ...next });
    return next;
  }

  function patch(partial) {
    return save(partial);
  }

  return { KEY, SCHEMA_VERSION, defaults, migrate, load, save, patch };
})();
