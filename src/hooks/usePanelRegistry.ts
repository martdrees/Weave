/**
 * Panel exclusivity registry (R1.3).
 * Exclusive modals share one slot; shortcuts / stats are independent overlays.
 */

import { getReact } from "./reactHost.ts";

const WEAVE_EXCLUSIVE_PANELS = [
  "addTrack",
  "copyPlaylist",
  "flowify",
  "generator",
] as const;

export type ExclusivePanelId = (typeof WEAVE_EXCLUSIVE_PANELS)[number];
export type PanelId = ExclusivePanelId | "shortcuts" | "stats";

export type PanelRegistryOpts = {
  initialStatsOpen?: boolean;
};

export type SearchOverlayLayers = {
  resultsOpen?: boolean;
  searchOpen?: boolean;
  closeResults?: () => void;
  closeSearch?: () => void;
};

export function usePanelRegistry(opts: PanelRegistryOpts = {}) {
  const react = getReact();
  const initialStatsOpen = !!opts.initialStatsOpen;

  const [exclusive, setExclusive] = react.useState<ExclusivePanelId | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = react.useState(false);
  const [statsOpen, setStatsOpen] = react.useState(initialStatsOpen);

  function isExclusiveId(id: string): id is ExclusivePanelId {
    return (WEAVE_EXCLUSIVE_PANELS as readonly string[]).indexOf(id) !== -1;
  }

  /** Open a panel. Exclusive ids replace any other exclusive modal. */
  function openPanel(id: PanelId | string | null | undefined): void {
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

  function closePanel(id: PanelId | string | null | undefined): void {
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

  function togglePanel(id: PanelId | string | null | undefined): void {
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

  function isOpen(id: PanelId | string | null | undefined): boolean {
    if (id === "shortcuts") return shortcutsOpen;
    if (id === "stats") return statsOpen;
    if (id && isExclusiveId(id)) return exclusive === id;
    return false;
  }

  /**
   * Esc stack: shortcuts → exclusive modal → search results → search → stats.
   * @returns true if something closed
   */
  function closeTopOverlay(searchLayers?: SearchOverlayLayers): boolean {
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
