/**
 * Weave i18n — Spotify client locale, English fallback.
 * Locale catalogs register via register(code, dict).
 */

import de from "./locales/de.ts";
import en from "./locales/en.ts";
import es from "./locales/es.ts";
import fr from "./locales/fr.ts";
import it from "./locales/it.ts";
import pt from "./locales/pt.ts";

export const FALLBACK = "en";
export const SUPPORTED = ["en", "de", "es", "pt", "fr", "it"] as const;
export type LocaleCode = (typeof SUPPORTED)[number];

const catalogs: Record<string, Record<string, string>> = Object.create(null);
let locale: string = FALLBACK;

export function normalizeCode(raw: string | null | undefined): string {
  if (!raw) return FALLBACK;
  const lower = String(raw).trim().toLowerCase().replace(/_/g, "-");
  const primary = lower.split("-")[0];
  if ((SUPPORTED as readonly string[]).includes(primary)) return primary;
  return FALLBACK;
}

export function register(code: string, dict: Record<string, string>): void {
  const id = normalizeCode(code);
  if (!id) return;
  catalogs[id] = { ...(catalogs[id] || {}), ...dict };
}

export function detectLocale(): string {
  try {
    if (typeof Spicetify !== "undefined") {
      if (typeof Spicetify.Locale?.getLocale === "function") {
        const fromLocale = Spicetify.Locale.getLocale();
        if (fromLocale) return normalizeCode(fromLocale);
      }
      const sessionLocale = (
        Spicetify.Platform as { Session?: { locale?: string } } | undefined
      )?.Session?.locale;
      if (sessionLocale) return normalizeCode(sessionLocale);
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof navigator !== "undefined" && navigator.language) {
      return normalizeCode(navigator.language);
    }
  } catch {
    /* ignore */
  }
  return FALLBACK;
}

export function init(): string {
  locale = detectLocale();
  if (!catalogs[locale]) locale = FALLBACK;
  return locale;
}

export function getLocale(): string {
  return locale;
}

export function t(key: string, vars?: Record<string, string | number> | null): string {
  const primary = catalogs[locale] || {};
  const fallback = catalogs[FALLBACK] || {};
  let text = primary[key];
  if (text == null || text === "") text = fallback[key];
  if (text == null || text === "") text = key;
  if (vars && typeof text === "string") {
    text = text.replace(/\{(\w+)\}/g, (_, name: string) =>
      vars[name] != null ? String(vars[name]) : ""
    );
  }
  return text;
}

/** Feature / metric label helper — keys under feature.* */
export function featureLabel(
  idOrDef: string | { id?: string; label?: string }
): string {
  const id = typeof idOrDef === "string" ? idOrDef : idOrDef?.id;
  if (!id) return "";
  const key = "feature." + id;
  const translated = t(key);
  if (translated !== key) return translated;
  return typeof idOrDef === "object" && idOrDef?.label ? idOrDef.label : id;
}

// Register built-in catalogs at module load.
register("en", en);
register("de", de);
register("es", es);
register("pt", pt);
register("fr", fr);
register("it", it);
init();
