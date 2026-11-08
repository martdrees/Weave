/**
 * Column visibility for results / generator / catalog tables (not the playlist Arranger).
 * Separate storage from columnConfig so playlist prefs stay untouched.
 */

export const WEAVE_KEY = "weave-results-columns";

/** @type {Record<string, { visible: boolean }> | null} */
let memory: Record<string, { visible: boolean }> | null = null;

export const COLUMNS = [
  { id: "INDEX", label: "#", always: true },
  { id: "TITLE_AND_ARTIST", label: "Track", always: true },
  { id: "BPM", label: "BPM", always: false, defaultVisible: true },
  { id: "KEY", label: "Key", always: false, defaultVisible: true },
  {
    id: "ENERGY",
    label: "Energy",
    always: false,
    defaultVisible: true,
    metricId: "energy",
    width: "3.5rem",
  },
  {
    id: "DANCEABILITY",
    label: "Dance",
    always: false,
    defaultVisible: true,
    metricId: "danceability",
    width: "3.25rem",
  },
  {
    id: "VALENCE",
    label: "Valence",
    always: false,
    defaultVisible: true,
    metricId: "valence",
    width: "3.5rem",
  },
  {
    id: "ACOUSTICNESS",
    label: "Acoustic",
    always: false,
    defaultVisible: true,
    metricId: "acousticness",
    width: "4rem",
  },
  {
    id: "INSTRUMENTALNESS",
    label: "Instr.",
    always: false,
    defaultVisible: false,
    metricId: "instrumentalness",
    width: "3rem",
  },
  {
    id: "SPEECHINESS",
    label: "Speech",
    always: false,
    defaultVisible: false,
    metricId: "speechiness",
    width: "3.1rem",
  },
  {
    id: "LIVENESS",
    label: "Live",
    always: false,
    defaultVisible: false,
    metricId: "liveness",
    width: "2.75rem",
  },
  {
    id: "LOUDNESS",
    label: "Loud",
    always: false,
    defaultVisible: false,
    metricId: "loudness",
    width: "3rem",
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

function readPersisted(): Record<string, any> | null {
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

function writePersisted(all: Record<string, { visible: boolean }>) {
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
  const saved = readPersisted();
  for (const col of COLUMNS) {
    if (col.always) continue;
    const fromMix = saved?.[col.id];
    if (fromMix && typeof fromMix.visible === "boolean") {
      base[col.id] = { visible: fromMix.visible };
    }
  }
  /** @type {Record<string, { visible: boolean }>} */
  const toSave: Record<string, { visible: boolean }> = {};
  for (const col of COLUMNS) {
    if (col.always) continue;
    toSave[col.id] = { visible: !!base[col.id].visible };
  }
  memory = toSave;
  writePersisted(toSave);
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
  writePersisted(mix);
  return getVisibility();
}

export function toggle(columnId: string) {
  const vis = getVisibility();
  return setVisible(columnId, !isVisible(vis, columnId));
}

export function featureWidth(col: { id?: string; width?: string }) {
  if (col.width) return col.width;
  if (col.id === "KEY") return "2.4rem";
  if (col.id === "BPM") return "2.6rem";
  return "3.5rem";
}
