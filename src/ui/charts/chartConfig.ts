/**
 * Stats chart config + pure series helpers (R2.3).
 */

import * as Features from "../../api/features.ts";
import type { MetricDef } from "../../domain/metrics.ts";
import type { TrackRow } from "../../types/track.ts";

export const AGG_METRIC: MetricDef & { kind: string } = {
  id: "aggChange",
  label: "Abs. Aggregate",
  field: "aggChange",
  kind: "percent",
  digits: 1,
};

export const MA_WINDOW = 5;

/** Soft accents — delegated to Features so tables/sliders/charts match. */
export const METRIC_COLORS = Features.FEATURE_COLORS;

const CHART_HINTS: Record<string, string> = {
  aggChange:
    "How much the playlist jumps from one track to the next. Combines energy, dance, valence, acoustic, instrumental, speech, liveliness, BPM compatibility, and Camelot key distance. Spikes mark rough transitions; low values mean a smoother flow.",
  energy:
    "Perceptual intensity: fast, loud, and noisy tracks score higher. Useful for set pacing and peaks.",
  danceability:
    "How suitable a track is for dancing — beat strength, stability, and a comfortable tempo.",
  valence:
    "Musical positivity. High = brighter/happier; low = darker or more melancholic.",
  acousticness:
    "Confidence that the track is acoustic rather than electronic or heavily produced.",
  instrumentalness:
    "Likelihood of little or no vocals. High values favor instrumental / no-vocal cuts.",
  speechiness:
    "Presence of spoken words. Higher for talk, rap, or spoken-word passages.",
  liveness: "Likelihood the track was recorded live (audience / room sound).",
  loudness: "Overall loudness in dB. Axis spans this playlist's min→max loudness.",
  tempo: "Estimated speed in BPM. Axis spans this playlist's min→max tempo.",
};

export type ChartPoint = {
  index: number;
  value: number | null;
  name: string;
  artists: string;
};

export type SeriesResult = {
  points: ChartPoint[];
  avgV: number | null;
  minV: number | null;
  maxV: number | null;
  extraMeta: string;
};

export type ChartDomain = { min: number; max: number };

export function allMetrics(): (MetricDef | typeof AGG_METRIC)[] {
  return [AGG_METRIC].concat(Features.METRICS.slice());
}

export function metricColor(id: string): string {
  return Features.featureColor(id);
}

export function chartHint(
  metric: { id?: string; label?: string } | null | undefined
): string {
  return (
    CHART_HINTS[metric?.id || ""] ||
    "Playlist order of " + (metric?.label || "feature") + " for each track."
  );
}

export function metricUnitHint(
  metric: { id?: string; kind?: string } | null | undefined
): string {
  if (metric?.id === "aggChange") return "Δ%";
  if (metric?.kind === "tempo") return "BPM";
  if (metric?.kind === "loudness") return "dB";
  return "%";
}

/** 0–1 features / aggregate → percent; tempo/loudness stay in BPM / dB. */
export function toChartValue(
  metric: { kind?: string; id?: string },
  value: unknown
): number | null {
  if (value == null || Number.isNaN(Number(value))) return null;
  const v = Number(value);
  if (metric.kind === "tempo" || metric.kind === "loudness") return v;
  if (metric.id === "aggChange" || metric.kind === "percent") return v;
  return v * 100;
}

export function formatChartValue(
  metric: { kind?: string; digits?: number },
  value: unknown
): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  if (metric.kind === "tempo" || metric.kind === "loudness") {
    return Features.formatMetric(metric as MetricDef, value);
  }
  const n = Number(value);
  if (Math.abs(n - Math.round(n)) < 0.05) return Math.round(n) + "%";
  return n.toFixed(1) + "%";
}

/**
 * Y domain: max is always the playlist max for this feature.
 * Percent charts floor at 0; BPM/loudness floor at playlist min.
 */
export function chartDomain(metric: { kind?: string }, values: number[]): ChartDomain {
  if (!values.length) {
    if (metric.kind === "tempo") return { min: 0, max: 1 };
    if (metric.kind === "loudness") return { min: -1, max: 0 };
    return { min: 0, max: 1 };
  }
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (metric.kind === "tempo" || metric.kind === "loudness") {
    if (hi === lo) {
      const pad = metric.kind === "tempo" ? 1 : 0.5;
      return { min: lo - pad, max: hi + pad };
    }
    return { min: lo, max: hi };
  }
  const max = hi <= 0 ? 1 : hi;
  return { min: 0, max };
}

/** Centered moving average; skips nulls inside the window. */
export function movingAverage(
  values: Array<number | null>,
  windowSize: number
): Array<number | null> {
  const half = Math.floor(windowSize / 2);
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= values.length) continue;
      const v = values[j];
      if (v == null || Number.isNaN(Number(v))) continue;
      sum += Number(v);
      count += 1;
    }
    out.push(count ? sum / count : null);
  }
  return out;
}

/**
 * Build point series + summary stats for a metric over playlist tracks.
 */
export function seriesForMetric(
  metric: MetricDef | typeof AGG_METRIC,
  tracks: TrackRow[] | null | undefined,
  agg?: ReturnType<typeof Features.absoluteAggregateChange> | null
): SeriesResult {
  const list = Array.isArray(tracks) ? tracks : [];
  const n = list.length;
  const points: ChartPoint[] = [];

  if (metric.id === "aggChange") {
    const a = agg || Features.absoluteAggregateChange(list);
    for (let i = 0; i < n; i++) {
      const track = list[i];
      points.push({
        index: i,
        value: a.values[i] ?? null,
        name: track?.name || "Unknown",
        artists: track?.artists || "",
      });
    }
    return {
      points,
      avgV: a.avg,
      minV: a.min,
      maxV: a.max,
      extraMeta:
        a.smoothness != null
          ? " · smooth " + formatChartValue(metric, a.smoothness)
          : "",
    };
  }

  for (let i = 0; i < n; i++) {
    const track = list[i];
    const raw = Features.metricValue(track, metric as MetricDef);
    points.push({
      index: i,
      value: toChartValue(metric, raw),
      name: track?.name || "Unknown",
      artists: track?.artists || "",
    });
  }
  const known = points.map((p) => p.value).filter((v): v is number => v != null);
  let avgV: number | null = null;
  let minV: number | null = null;
  let maxV: number | null = null;
  if (known.length) {
    avgV = known.reduce((a, b) => a + b, 0) / known.length;
    minV = Math.min(...known);
    maxV = Math.max(...known);
  }
  return { points, avgV, minV, maxV, extraMeta: "" };
}
