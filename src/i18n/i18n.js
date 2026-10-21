//@ts-check
/**
 * Weave i18n — follows Spotify client locale, English fallback.
 * Locale catalogs register via MixAppI18n.register(code, dict).
 *
 * Detect: Spicetify.Locale.getLocale() → Platform.Session.locale → navigator.
 */

const MixAppI18n = (() => {
  const FALLBACK = "en";
  /** @type {Record<string, Record<string, string>>} */
  const catalogs = Object.create(null);
  /** @type {string} */
  let locale = FALLBACK;

  const SUPPORTED = ["en", "de", "es", "pt", "fr", "it"];

  /**
   * @param {string} code
   * @param {Record<string, string>} dict
   */
  function register(code, dict) {
    const id = normalizeCode(code);
    if (!id) return;
    catalogs[id] = { ...(catalogs[id] || {}), ...dict };
  }

  /** @param {string} raw */
  function normalizeCode(raw) {
    if (!raw) return FALLBACK;
    const lower = String(raw).trim().toLowerCase().replace(/_/g, "-");
    const primary = lower.split("-")[0];
    if (SUPPORTED.includes(primary)) return primary;
    return FALLBACK;
  }

  function detectLocale() {
    try {
      if (typeof Spicetify !== "undefined") {
        if (typeof Spicetify.Locale?.getLocale === "function") {
          const fromLocale = Spicetify.Locale.getLocale();
          if (fromLocale) return normalizeCode(fromLocale);
        }
        const sessionLocale = Spicetify.Platform?.Session?.locale;
        if (sessionLocale) return normalizeCode(sessionLocale);
      }
    } catch (_) {
      /* ignore */
    }
    try {
      if (typeof navigator !== "undefined" && navigator.language) {
        return normalizeCode(navigator.language);
      }
    } catch (_) {
      /* ignore */
    }
    return FALLBACK;
  }

  function init() {
    locale = detectLocale();
    if (!catalogs[locale]) locale = FALLBACK;
    return locale;
  }

  function getLocale() {
    return locale;
  }

  /**
   * @param {string} key
   * @param {Record<string, string|number>|null} [vars]
   */
  function t(key, vars) {
    const primary = catalogs[locale] || {};
    const fallback = catalogs[FALLBACK] || {};
    let text = primary[key];
    if (text == null || text === "") text = fallback[key];
    if (text == null || text === "") text = key;
    if (vars && typeof text === "string") {
      text = text.replace(/\{(\w+)\}/g, (_, name) =>
        vars[name] != null ? String(vars[name]) : ""
      );
    }
    return text;
  }

  /** Feature / metric label helper — keys under feature.* */
  function featureLabel(idOrDef) {
    const id = typeof idOrDef === "string" ? idOrDef : idOrDef?.id;
    if (!id) return "";
    const key = "feature." + id;
    const translated = t(key);
    if (translated !== key) return translated;
    return typeof idOrDef === "object" && idOrDef?.label ? idOrDef.label : id;
  }

  return {
    FALLBACK,
    SUPPORTED,
    register,
    init,
    detectLocale,
    getLocale,
    t,
    featureLabel,
    normalizeCode,
  };
})();
