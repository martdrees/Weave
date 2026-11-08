/**
 * Durable UI prefs (WeavePrefs) — load once, patch when values change.
 * Sole writer for resultLimit / searchFilters / prefer* panel defaults.
 * See docs/PERSISTENCE.md.
 */

import * as WeavePrefs from "../state/prefsStore.ts";
import type { PrefsState, SearchFilters } from "../state/prefsStore.ts";
import { getReact } from "./reactHost.ts";

export type PersistedPrefsSyncValues = {
  resultLimit: number;
  searchFilters: SearchFilters | PrefsState["searchFilters"];
  searchOpen: boolean;
  statsOpen: boolean;
};

export function useInitialPrefs(): PrefsState {
  const react = getReact();
  const prefsRef = react.useRef<PrefsState | null>(null);
  if (prefsRef.current === null) {
    prefsRef.current = WeavePrefs.load();
  }
  return prefsRef.current;
}

/** Keep WeavePrefs in sync with live UI values (React effect timing). */
export function usePersistedPrefsSync(values: PersistedPrefsSyncValues): void {
  const react = getReact();
  const { resultLimit, searchFilters, searchOpen, statsOpen } = values || {
    resultLimit: WeavePrefs.defaults().resultLimit,
    searchFilters: WeavePrefs.defaults().searchFilters,
    searchOpen: false,
    statsOpen: false,
  };
  react.useEffect(() => {
    WeavePrefs.patch({
      resultLimit,
      searchFilters,
      preferSearchOpen: !!searchOpen,
      preferStatsOpen: !!statsOpen,
    });
  }, [resultLimit, searchFilters, searchOpen, statsOpen]);
}
