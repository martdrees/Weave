//@ts-check
/**
 * Durable UI prefs (MixAppPrefs) — load once, patch when values change.
 * Sole writer for resultLimit / searchFilters / prefer* panel defaults.
 * See docs/PERSISTENCE.md.
 */

function MixAppUseInitialPrefs() {
  const react = Spicetify.React;
  const prefsRef = react.useRef(null);
  if (prefsRef.current === null) {
    prefsRef.current = MixAppPrefs.load();
  }
  return prefsRef.current;
}

/**
 * Keep MixAppPrefs in sync with live UI values (debounced by React effect timing).
 * @param {{ resultLimit: number, searchFilters: object, searchOpen: boolean, statsOpen: boolean }} values
 */
function MixAppUsePersistedPrefsSync(values) {
  const react = Spicetify.React;
  const { resultLimit, searchFilters, searchOpen, statsOpen } = values || {};
  react.useEffect(() => {
    MixAppPrefs.patch({
      resultLimit,
      searchFilters,
      preferSearchOpen: !!searchOpen,
      preferStatsOpen: !!statsOpen,
    });
  }, [resultLimit, searchFilters, searchOpen, statsOpen]);
}
