/**
 * Playlist column visibility for Weave.
 * Sole owner of column visibility (not prefs/session). See docs/PERSISTENCE.md.
 */

import { METRICS } from "../domain/metrics.ts";

const SPOTIFY_KEY = "column-config";
export const SCOPE = "playlist-tracklist";
export const WEAVE_KEY = "weave-feature-columns";

let memory: Record<string, { visible: boolean }> | null = null;

export const COLUMNS = [
  { id: "INDEX", label: "#", always: true },
  { id: "TITLE_AND_ARTIST", label: "Track", always: true },
  { id: "ALBUM", label: "Album (in track)", always: false, defaultVisible: true },
  { id: "ADDED_AT", label: "Date added", always: false, defaultVisible: false },
  { id: "BPM", label: "BPM", always: false, defaultVisible: true },
  { id: "KEY", label: "Key", always: false, defaultVisible: true },
  {
    id: "ENERGY",
    label: "Energy",
    always: false,
    defaultVisible: true,
    metricId: "energy",
  },
  {
    id: "DANCEABILITY",
    label: "Dance",
    always: false,
    defaultVisible: true,
    metricId: "danceability",
  },
  {
    id: "VALENCE",
    label: "Valence",
    always: false,
    defaultVisible: false,
    metricId: "valence",
  },
  {
    id: "ACOUSTICNESS",
    label: "Acoustic",
    always: false,
    defaultVisible: false,
    metricId: "acousticness",
  },
  {
    id: "INSTRUMENTALNESS",
    label: "Instr.",
    always: false,
    defaultVisible: false,
    metricId: "instrumentalness",
  },
  {
    id: "SPEECHINESS",
    label: "Speech",
    always: false,
    defaultVisible: false,
    metricId: "speechiness",
  },
  {
    id: "LIVENESS",
    label: "Live",
    always: false,
    defaultVisible: false,
    metricId: "liveness",
  },
  {
    id: "LOUDNESS",
    label: "Loud",
    always: false,
    defaultVisible: false,
    metricId: "loudness",
  },
  { id: "DURATION", label: "Time", always: false, defaultVisible: true },
  { id: "ACTIONS", label: "Actions", always: true },
];

export function defaults() {
  const out: Record<string, { visible: boolean }> = {};
  for (const col of COLUMNS) {
    out[col.id] = { visible: col.always ? true : !!col.defaultVisible };
  }
  return out;
}

function readSpotifyScoped(): Record<string, any> {
  try {
    const api = Spicetify?.Platform?.LocalStorageAPI;
    const all = api?.getItem?.(SPOTIFY_KEY);
    if (all && typeof all === "object")
      return (all[SCOPE] as Record<string, any>) || {};
  } catch {
    /* ignore */
  }
  return {};
}

function readPersistedMix(): Record<string, any> | null {
  try {
    const api = Spicetify?.Platform?.LocalStorageAPI;
    const all = api?.getItem?.(WEAVE_KEY);
    if (all && typeof all === "object") return all;
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem("weave:" + WEAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

function writePersistedMix(all: Record<string, { visible: boolean }>) {
  try {
    Spicetify?.Platform?.LocalStorageAPI?.setItem?.(WEAVE_KEY, all);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem("weave:" + WEAVE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function ensureMemory() {
  if (memory) return memory;
  const base = defaults();
  const spotify = readSpotifyScoped();
  const saved = readPersistedMix();

  for (const col of COLUMNS) {
    if (col.always) continue;
    // Prefer Weave-saved prefs; else seed once from Spotify playlist columns.
    const fromMix = saved?.[col.id];
    if (fromMix && typeof fromMix.visible === "boolean") {
      base[col.id] = { visible: fromMix.visible };
      continue;
    }
    const fromSpotify = spotify[col.id];
    if (fromSpotify && typeof fromSpotify.visible === "boolean") {
      base[col.id] = { visible: fromSpotify.visible };
    }
  }

  // Persist only Weave toggleable entries

  const toSave: Record<string, { visible: boolean }> = {};
  for (const col of COLUMNS) {
    if (col.always) continue;
    toSave[col.id] = { visible: !!base[col.id].visible };
  }
  memory = toSave;
  writePersistedMix(toSave);
  return memory;
}

export function getVisibility() {
  const mix = ensureMemory();
  const base = defaults();
  for (const col of COLUMNS) {
    if (col.always) {
      base[col.id] = { visible: true };
      continue;
    }
    const entry = mix[col.id];
    if (entry && typeof entry.visible === "boolean") {
      base[col.id] = { visible: entry.visible };
    }
  }
  return base;
}

export function isVisible(
  visibility: Record<string, { visible?: boolean }> | null | undefined,
  columnId: string
) {
  return !!visibility?.[columnId]?.visible;
}

export function setVisible(columnId: string, visible: boolean) {
  const col = COLUMNS.find((c) => c.id === columnId);
  if (!col || col.always) return getVisibility();

  const mix = { ...ensureMemory() };
  mix[columnId] = { visible: !!visible };
  memory = mix;
  writePersistedMix(mix);
  return getVisibility();
}

export function toggle(columnId: string) {
  const vis = getVisibility();
  return setVisible(columnId, !isVisible(vis, columnId));
}

export function subscribe(
  onChange: (visibility: Record<string, { visible: boolean }>) => void
) {
  // No polling — React state is updated directly on toggle.
  // Still listen if Spotify storage changes elsewhere.
  const api = Spicetify?.Platform?.LocalStorageAPI;
  if (!api || typeof api.addListener !== "function") return () => {};
  const handler = () => {
    // Refresh from disk only if we have no memory yet
    if (!memory) onChange(getVisibility());
  };
  try {
    api.listenToStorageEvents?.();
    api.addListener("update", handler);
    return () => api.removeListener?.("update", handler);
  } catch {
    return () => {};
  }
}

export function formatAddedAt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export function columnMetric(columnId: string) {
  const col = COLUMNS.find((c) => c.id === columnId);
  if (!col?.metricId) return null;
  return METRICS.find((m) => m.id === col.metricId) || null;
}

export const STORAGE_KEY = WEAVE_KEY;
