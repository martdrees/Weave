//@ts-check
/**
 * Stats chart config + pure series helpers (R2.3).
 */

const MixAppChartConfig = (() => {
  const AGG_METRIC = {
    id: "aggChange",
    label: "Abs. Aggregate",
    kind: "percent",
    digits: 1,
  };

  const MA_WINDOW = 5;

  /** Soft accents on dark spice-card — keyed to feature identity. */
  const METRIC_COLORS = {
    aggChange: "#e879f9",
    energy: "#1ed760",
    danceability: "#3ecf8e",
    valence: "#f0c14a",
    acousticness: "#6cb6ff",
    instrumentalness: "#a78bfa",
    speechiness: "#f472b6",
    liveness: "#2dd4bf",
    loudness: "#fb923c",
    tempo: "#38bdf8",
  };

  const CHART_HINTS = {
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
    liveness:
      "Likelihood the track was recorded live (audience / room sound).",
    loudness:
      "Overall loudness in dB. Axis spans this playlist’s min→max loudness.",
    tempo:
      "Estimated speed in BPM. Axis spans this playlist’s min→max tempo.",
  };

  function allMetrics() {
    return [AGG_METRIC].concat(MixAppFeatures.METRICS.slice());
  }

  function metricColor(id) {
    return METRIC_COLORS[id] || "var(--spice-button, #1db954)";
  }

  function chartHint(metric) {
    return (
      CHART_HINTS[metric?.id] ||
      ("Playlist order of " + (metric?.label || "feature") + " for each track.")
    );
  }

  function metricUnitHint(metric) {
    if (metric?.id === "aggChange") return "Δ%";
    if (metric?.kind === "tempo") return "BPM";
    if (metric?.kind === "loudness") return "dB";
    return "%";
  }

  /** 0–1 features / aggregate → percent; tempo/loudness stay in BPM / dB. */
  function toChartValue(metric, value) {
    if (value == null || Number.isNaN(Number(value))) return null;
    const v = Number(value);
    if (metric.kind === "tempo" || metric.kind === "loudness") return v;
    if (metric.id === "aggChange" || metric.kind === "percent") return v;
    return v * 100;
  }

  function formatChartValue(metric, value) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    if (metric.kind === "tempo" || metric.kind === "loudness") {
      return MixAppFeatures.formatMetric(metric, value);
    }
    const n = Number(value);
    if (Math.abs(n - Math.round(n)) < 0.05) return Math.round(n) + "%";
    return n.toFixed(1) + "%";
  }

  /**
   * Y domain: max is always the playlist max for this feature.
   * Percent charts floor at 0; BPM/loudness floor at playlist min.
   */
  function chartDomain(metric, values) {
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
  function movingAverage(values, windowSize) {
    const half = Math.floor(windowSize / 2);
    const out = [];
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
   * @param {object} metric
   * @param {object[]} tracks
   * @param {object} [agg] — absoluteAggregateChange result when metric is aggChange
   */
  function seriesForMetric(metric, tracks, agg) {
    const list = Array.isArray(tracks) ? tracks : [];
    const n = list.length;
    const points = [];

    if (metric.id === "aggChange") {
      const a = agg || MixAppFeatures.absoluteAggregateChange(list);
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
      const raw = MixAppFeatures.metricValue(track, metric);
      points.push({
        index: i,
        value: toChartValue(metric, raw),
        name: track?.name || "Unknown",
        artists: track?.artists || "",
      });
    }
    const known = points.map((p) => p.value).filter((v) => v != null);
    let avgV = null;
    let minV = null;
    let maxV = null;
    if (known.length) {
      avgV = known.reduce((a, b) => a + b, 0) / known.length;
      minV = Math.min(...known);
      maxV = Math.max(...known);
    }
    return { points, avgV, minV, maxV, extraMeta: "" };
  }

  return {
    AGG_METRIC,
    MA_WINDOW,
    METRIC_COLORS,
    CHART_HINTS,
    allMetrics,
    metricColor,
    chartHint,
    metricUnitHint,
    toChartValue,
    formatChartValue,
    chartDomain,
    movingAverage,
    seriesForMetric,
  };
})();
