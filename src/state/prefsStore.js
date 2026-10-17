//@ts-check
/**
 * Durable MixApp UI prefs (survive playlist changes / session clear).
 * Separate from MixAppSession (working playlist snapshot).
 */

const MixAppPrefs = (() => {
  const KEY = "mixapp-prefs-v1";

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
    return normalize(data);
  }

  function save(partial) {
    const next = normalize({ ...load(), ...(partial || {}) });
    storageSet({ v: 1, savedAt: Date.now(), ...next });
    return next;
  }

  function patch(partial) {
    return save(partial);
  }

  return { KEY, defaults, load, save, patch };
})();
