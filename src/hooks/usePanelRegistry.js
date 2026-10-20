//@ts-check
/**
 * Panel exclusivity registry (R1.3).
 * Exclusive modals share one slot; shortcuts / stats are independent overlays.
 */

const MIXAPP_EXCLUSIVE_PANELS = ["addTrack", "copyPlaylist", "flowify", "generator"];

/**
 * @param {{ initialStatsOpen?: boolean }} [opts]
 */
function MixAppUsePanelRegistry(opts) {
  const react = Spicetify.React;
  const initialStatsOpen = !!(opts && opts.initialStatsOpen);

  /** @type {[string|null, Function]} */
  const [exclusive, setExclusive] = react.useState(null);
  const [shortcutsOpen, setShortcutsOpen] = react.useState(false);
  const [statsOpen, setStatsOpen] = react.useState(initialStatsOpen);

  function isExclusiveId(id) {
    return MIXAPP_EXCLUSIVE_PANELS.indexOf(id) !== -1;
  }

  /** Open a panel. Exclusive ids replace any other exclusive modal. */
  function openPanel(id) {
    if (!id) return;
    if (id === "shortcuts") {
      setShortcutsOpen(true);
      return;
    }
    if (id === "stats") {
      setStatsOpen(true);
      return;
    }
    if (isExclusiveId(id)) {
      setExclusive(id);
    }
  }

  function closePanel(id) {
    if (!id) return;
    if (id === "shortcuts") {
      setShortcutsOpen(false);
      return;
    }
    if (id === "stats") {
      setStatsOpen(false);
      return;
    }
    if (isExclusiveId(id)) {
      setExclusive((cur) => (cur === id ? null : cur));
    }
  }

  function togglePanel(id) {
    if (!id) return;
    if (id === "shortcuts") {
      setShortcutsOpen((v) => !v);
      return;
    }
    if (id === "stats") {
      setStatsOpen((v) => !v);
      return;
    }
    if (isExclusiveId(id)) {
      setExclusive((cur) => (cur === id ? null : id));
    }
  }

  function isOpen(id) {
    if (id === "shortcuts") return shortcutsOpen;
    if (id === "stats") return statsOpen;
    if (isExclusiveId(id)) return exclusive === id;
    return false;
  }

  /**
   * Esc stack: shortcuts → exclusive modal → search results → search → stats.
   * @param {{
   *   resultsOpen?: boolean,
   *   searchOpen?: boolean,
   *   closeResults?: () => void,
   *   closeSearch?: () => void,
   * }} [searchLayers]
   * @returns {boolean} true if something closed
   */
  function closeTopOverlay(searchLayers) {
    if (shortcutsOpen) {
      setShortcutsOpen(false);
      return true;
    }
    if (exclusive) {
      setExclusive(null);
      return true;
    }
    if (searchLayers?.resultsOpen) {
      searchLayers.closeResults?.();
      return true;
    }
    if (searchLayers?.searchOpen) {
      searchLayers.closeSearch?.();
      return true;
    }
    if (statsOpen) {
      setStatsOpen(false);
      return true;
    }
    return false;
  }

  return {
    exclusive,
    openPanel,
    closePanel,
    togglePanel,
    isOpen,
    closeTopOverlay,
    shortcutsOpen,
    statsOpen,
    setStatsOpen,
    addTrackOpen: exclusive === "addTrack",
    copyPlaylistOpen: exclusive === "copyPlaylist",
    flowifyOpen: exclusive === "flowify",
    generatorOpen: exclusive === "generator",
  };
}
