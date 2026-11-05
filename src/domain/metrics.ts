/**
 * Pure metrics: filter / sort / stats / coloring helpers (no I/O).
 * Split from legacy api/features.js per ADR 005.
 */

import { keyCompatDistance } from "./key.ts";
import type { TrackRow } from "../types/track.ts";

export type MetricDef = {
  id: string;
  label: string;
  field: string;
  kind: "01" | "loudness" | "tempo" | string;
  digits: number;
};

/** Numeric metrics shown in arranger / stats (0–1 unless noted). */
export const METRICS: MetricDef[] = [
  { id: "energy", label: "Energy", field: "energy", kind: "01", digits: 2 },
  {
    id: "danceability",
    label: "Dance",
    field: "danceability",
    kind: "01",
    digits: 2,
  },
  { id: "valence", label: "Valence", field: "valence", kind: "01", digits: 2 },
  {
    id: "acousticness",
    label: "Acoustic",
    field: "acousticness",
    kind: "01",
    digits: 2,
  },
  {
    id: "instrumentalness",
    label: "Instr.",
    field: "instrumentalness",
    kind: "01",
    digits: 2,
  },
  { id: "speechiness", label: "Speech", field: "speechiness", kind: "01", digits: 2 },
  { id: "liveness", label: "Live", field: "liveness", kind: "01", digits: 2 },
  { id: "loudness", label: "Loud", field: "loudness", kind: "loudness", digits: 1 },
  { id: "tempo", label: "BPM", field: "tempo", kind: "tempo", digits: 0 },
];

/**
 * Stable muted feature identity colors (tables, sliders, charts).
 * Intentionally desaturated for dark Spotify chrome.
 */
export const FEATURE_COLORS = Object.freeze({
  energy: "#6a9474",
  danceability: "#5d8f84",
  valence: "#a8945e",
  acousticness: "#6a87a3",
  instrumentalness: "#8578a0",
  speechiness: "#9a7380",
  liveness: "#5d8f88",
  loudness: "#9a8060",
  tempo: "#6288a0",
  popularity: "#8a8378",
  aggChange: "#8a7398",
}) as Readonly<Record<string, string>>;

export function formatMetric(metric: MetricDef, value: unknown): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  if (metric.kind === "tempo") return String(Math.round(n));
  if (metric.kind === "loudness") return n.toFixed(1);
  return n.toFixed(metric.digits ?? 2);
}

export function metricValue(
  track: TrackRow | Record<string, unknown> | null | undefined,
  metric: MetricDef | null | undefined
): number | null {
  if (!track || !metric) return null;
  if (metric.field === "tempo") {
    const v = (track as TrackRow).tempo ?? (track as TrackRow).bpm;
    return v == null || v === "" ? null : Number(v);
  }
  const v = (track as Record<string, unknown>)[metric.field];
  return v == null || Number.isNaN(Number(v)) ? null : Number(v);
}

/** Normalize value to 0–1 within playlist min/max for relative coloring. */
export function relativeNorm(
  value: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined
): number | null {
  if (value == null || min == null || max == null) return null;
  if (max === min) return 0.5;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export function featureColorId(id: unknown): string | null {
  if (id == null || id === "") return null;
  const raw = String(id);
  if (/^(BPM|bpm|TEMPO)$/i.test(raw)) return "tempo";
  const lower = raw.toLowerCase();
  if (FEATURE_COLORS[lower]) return lower;
  return null;
}

export function featureColor(id: unknown): string {
  const key = featureColorId(id);
  return (key && FEATURE_COLORS[key]) || "#6e7882";
}

/** Soft fill from the feature’s fixed hue (pills, range tracks). */
export function featureTint(id: unknown, alpha = 0.4): string {
  const hex = featureColor(id);
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const a = Math.min(1, Math.max(0, Number(alpha)));
  return "rgba(" + r + "," + g + "," + b + "," + a + ")";
}

/**
 * Heat color: low = cool blue, mid = green, high = amber.
 * Prefer featureTint(id) for stable identity colors.
 */
export function relativeColor(norm: number | null | undefined): string | null {
  if (norm == null) return null;
  const t = Math.min(1, Math.max(0, norm));
  let r: number;
  let g: number;
  let b: number;
  if (t < 0.5) {
    const u = t * 2;
    r = Math.round(60 + u * 20);
    g = Math.round(100 + u * 100);
    b = Math.round(180 - u * 80);
  } else {
    const u = (t - 0.5) * 2;
    r = Math.round(80 + u * 140);
    g = Math.round(200 - u * 40);
    b = Math.round(100 - u * 60);
  }
  return "rgba(" + r + "," + g + "," + b + ",0.35)";
}

export function rangeForMetric(
  tracks: TrackRow[] | null | undefined,
  metric: MetricDef
): { min: number | null; max: number | null; count: number } {
  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  for (const t of tracks || []) {
    const v = metricValue(t, metric);
    if (v == null) continue;
    count += 1;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!count) return { min: null, max: null, count: 0 };
  return { min, max, count };
}

/**
 * BPM “compatibility distance” in 0…1.
 * Near tempos and double/half-time count as close (MixMoose-style).
 */
export function bpmCompatDistance(a: unknown, b: unknown): number | null {
  if (a == null || b == null) return null;
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) {
    return null;
  }
  const r = Math.max(x, y) / Math.min(x, y);
  const d = Math.min(Math.abs(r - 1), Math.abs(r - 2), Math.abs(r - 0.5));
  return Math.min(1, d);
}

const AGG_CHANGE_01_FIELDS = [
  "energy",
  "danceability",
  "valence",
  "acousticness",
  "instrumentalness",
  "speechiness",
  "liveness",
] as const;

/**
 * Absolute Aggregate Change per track (transition into that track).
 * Track 0 has no prior → null. Values are 0…100 (%).
 */
export function absoluteAggregateChange(tracks: TrackRow[] | null | undefined) {
  const list = Array.isArray(tracks) ? tracks : [];
  const values: (number | null)[] = [];
  for (let i = 0; i < list.length; i++) {
    if (i === 0) {
      values.push(null);
      continue;
    }
    const prev = list[i - 1];
    const cur = list[i];
    const parts: number[] = [];
    for (const field of AGG_CHANGE_01_FIELDS) {
      const a = prev?.[field];
      const b = cur?.[field];
      if (
        a == null ||
        b == null ||
        Number.isNaN(Number(a)) ||
        Number.isNaN(Number(b))
      ) {
        continue;
      }
      parts.push(Math.abs(Number(a) - Number(b)));
    }
    const bpmA = prev?.tempo ?? prev?.bpm;
    const bpmB = cur?.tempo ?? cur?.bpm;
    const bpmD = bpmCompatDistance(bpmA, bpmB);
    if (bpmD != null) parts.push(bpmD);
    const keyD = keyCompatDistance(prev, cur);
    if (keyD != null) parts.push(keyD);

    if (!parts.length) {
      values.push(null);
      continue;
    }
    const mean = parts.reduce((s, v) => s + v, 0) / parts.length;
    values.push(Math.min(100, Math.max(0, mean * 100)));
  }

  const known = values.filter((v): v is number => v != null);
  let avg: number | null = null;
  let min: number | null = null;
  let max: number | null = null;
  if (known.length) {
    avg = known.reduce((s, v) => s + v, 0) / known.length;
    min = Math.min(...known);
    max = Math.max(...known);
  }
  return {
    id: "aggChange",
    label: "Abs. Aggregate",
    kind: "percent",
    values,
    count: known.length,
    avg,
    min,
    max,
    /** 100% = perfectly smooth transitions. */
    smoothness: avg == null ? null : Math.max(0, 100 - avg),
  };
}

export function aggregateStats(tracks: TrackRow[] | null | undefined) {
  const stats: Record<
    string,
    {
      count: number;
      min: number | null;
      max: number | null;
      avg: number | null;
      values?: number[];
    }
  > = {};
  for (const metric of METRICS) {
    const values: number[] = [];
    for (const t of tracks || []) {
      const v = metricValue(t, metric);
      if (v != null) values.push(v);
    }
    if (!values.length) {
      stats[metric.id] = { count: 0, min: null, max: null, avg: null };
      continue;
    }
    const sum = values.reduce((a, b) => a + b, 0);
    stats[metric.id] = {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
      values,
    };
  }

  const keyCounts: Record<string, number> = {};
  for (const t of tracks || []) {
    const k = t.key || "—";
    keyCounts[k] = (keyCounts[k] || 0) + 1;
  }
  const topKeys = Object.entries(keyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, count]) => ({ key, count }));

  return { metrics: stats, topKeys, trackCount: (tracks || []).length };
}

/** Histogram bins (0–1 normalized into `bins` buckets for charting). */
export function histogram(
  values: number[] | null | undefined,
  bins = 10,
  kind = "01"
): number[] {
  const out = Array.from({ length: bins }, () => 0);
  if (!values?.length) return out;
  let min = 0;
  let max = 1;
  if (kind === "tempo") {
    min = 40;
    max = 220;
  } else if (kind === "loudness") {
    min = -60;
    max = 0;
  }
  for (const v of values) {
    const n = (v - min) / (max - min);
    let i = Math.floor(n * bins);
    if (i < 0) i = 0;
    if (i >= bins) i = bins - 1;
    out[i] += 1;
  }
  return out;
}

export type ArrangerFilters = {
  query: string;
  bpmMin: string | number;
  bpmMax: string | number;
  energyMin: string | number;
  energyMax: string | number;
  valenceMin: string | number;
  valenceMax: string | number;
  keyQuery: string;
};

export function defaultArrangerFilters(): ArrangerFilters {
  return {
    query: "",
    bpmMin: "",
    bpmMax: "",
    energyMin: "",
    energyMax: "",
    valenceMin: "",
    valenceMax: "",
    keyQuery: "",
  };
}

export function filtersActive(filters: ArrangerFilters | null | undefined): boolean {
  if (!filters) return false;
  return !!(
    filters.query ||
    filters.bpmMin !== "" ||
    filters.bpmMax !== "" ||
    filters.energyMin !== "" ||
    filters.energyMax !== "" ||
    filters.valenceMin !== "" ||
    filters.valenceMax !== "" ||
    filters.keyQuery
  );
}

export function filterTracks(
  tracks: TrackRow[] | null | undefined,
  filters: ArrangerFilters | null | undefined
): TrackRow[] {
  if (!filtersActive(filters)) return tracks || [];
  const f = filters!;
  const q = String(f.query || "")
    .trim()
    .toLowerCase();
  const keyQ = String(f.keyQuery || "")
    .trim()
    .toLowerCase();
  const bpmMin = f.bpmMin === "" ? null : parseFloat(String(f.bpmMin));
  const bpmMax = f.bpmMax === "" ? null : parseFloat(String(f.bpmMax));
  const energyMin = f.energyMin === "" ? null : parseFloat(String(f.energyMin));
  const energyMax = f.energyMax === "" ? null : parseFloat(String(f.energyMax));
  const valenceMin = f.valenceMin === "" ? null : parseFloat(String(f.valenceMin));
  const valenceMax = f.valenceMax === "" ? null : parseFloat(String(f.valenceMax));

  return (tracks || []).filter((t) => {
    if (q) {
      const hay = (
        (t.name || "") +
        " " +
        (t.artists || "") +
        " " +
        (t.album || "")
      ).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (keyQ) {
      if (
        !String(t.key || "")
          .toLowerCase()
          .includes(keyQ)
      )
        return false;
    }
    const bpm = t.bpm != null ? Number(t.bpm) : null;
    if (bpmMin != null && Number.isFinite(bpmMin) && (bpm == null || bpm < bpmMin))
      return false;
    if (bpmMax != null && Number.isFinite(bpmMax) && (bpm == null || bpm > bpmMax))
      return false;
    const energy = t.energy != null ? Number(t.energy) : null;
    if (
      energyMin != null &&
      Number.isFinite(energyMin) &&
      (energy == null || energy < energyMin)
    )
      return false;
    if (
      energyMax != null &&
      Number.isFinite(energyMax) &&
      (energy == null || energy > energyMax)
    )
      return false;
    const valence = t.valence != null ? Number(t.valence) : null;
    if (
      valenceMin != null &&
      Number.isFinite(valenceMin) &&
      (valence == null || valence < valenceMin)
    )
      return false;
    if (
      valenceMax != null &&
      Number.isFinite(valenceMax) &&
      (valence == null || valence > valenceMax)
    )
      return false;
    return true;
  });
}

export function sortTracks(
  tracks: TrackRow[] | null | undefined,
  sortKey: string | null | undefined,
  direction: string | null | undefined
): TrackRow[] {
  if (!sortKey || !direction) return (tracks || []).slice();
  const dir = direction === "desc" ? -1 : 1;
  const metric = METRICS.find((m) => m.id === sortKey || m.field === sortKey);
  const list = (tracks || []).slice();
  const order = new Map<string | number, number>();
  (tracks || []).forEach((t, i) => {
    order.set(t.uid || t.uri || i, i);
  });
  list.sort((a, b) => {
    let av: unknown;
    let bv: unknown;
    if (sortKey === "index" || sortKey === "INDEX" || sortKey === "#") {
      av = order.get(a.uid || a.uri) ?? 0;
      bv = order.get(b.uid || b.uri) ?? 0;
      return ((av as number) - (bv as number)) * dir;
    }
    if (sortKey === "name") {
      av = a.name || "";
      bv = b.name || "";
      return String(av).localeCompare(String(bv)) * dir;
    }
    if (sortKey === "artists") {
      av = a.artists || "";
      bv = b.artists || "";
      return String(av).localeCompare(String(bv)) * dir;
    }
    if (sortKey === "album") {
      av = a.album || "";
      bv = b.album || "";
      return String(av).localeCompare(String(bv)) * dir;
    }
    if (sortKey === "key") {
      av = a.key || "";
      bv = b.key || "";
      return String(av).localeCompare(String(bv)) * dir;
    }
    if (sortKey === "duration" || sortKey === "DURATION") {
      av = a.durationMs ?? 0;
      bv = b.durationMs ?? 0;
      return ((av as number) - (bv as number)) * dir;
    }
    if (sortKey === "BPM" || sortKey === "bpm" || sortKey === "tempo") {
      av = a.bpm ?? a.tempo;
      bv = b.bpm ?? b.tempo;
    } else if (metric) {
      av = metricValue(a, metric);
      bv = metricValue(b, metric);
    } else {
      av = (a as Record<string, unknown>)[sortKey];
      bv = (b as Record<string, unknown>)[sortKey];
    }
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string") return av.localeCompare(String(bv)) * dir;
    return (Number(av) - Number(bv)) * dir;
  });
  return list;
}
