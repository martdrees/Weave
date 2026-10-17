//@ts-check

function MixAppStatsPanel(props) {
  const react = Spicetify.React;
  const { open, tracks, onClose } = props;

  const AGG_METRIC = {
    id: "aggChange",
    label: "Abs. Aggregate",
    kind: "percent",
    digits: 1,
  };

  const allMetrics = [AGG_METRIC].concat(MixAppFeatures.METRICS.slice());

  const [visibleIds, setVisibleIds] = react.useState(() => {
    const allIds = allMetrics.map((m) => m.id);
    const saved = MixAppPrefs?.load?.()?.statsVisibleMetrics;
    if (Array.isArray(saved) && saved.length) {
      const allowed = new Set(allIds);
      let filtered = saved.filter((id) => allowed.has(id));
      // Prefs from before Abs. Aggregate existed — turn that chart on once.
      if (!saved.includes("aggChange") && allowed.has("aggChange")) {
        filtered = ["aggChange"].concat(filtered);
      }
      if (filtered.length) return filtered;
    }
    return allIds;
  });

  if (!open) return null;

  const list = Array.isArray(tracks) ? tracks : [];
  const stats = MixAppFeatures.aggregateStats(list);
  const agg = MixAppFeatures.absoluteAggregateChange(list);
  const chartMetrics = allMetrics.filter((m) => visibleIds.includes(m.id));
  const MA_WINDOW = 5;

  function metricUnitHint(metric) {
    if (metric.id === "aggChange") return "Δ%";
    if (metric.kind === "tempo") return "BPM";
    if (metric.kind === "loudness") return "dB";
    return "%";
  }

  function toggleMetric(id) {
    setVisibleIds((prev) => {
      const on = prev.includes(id);
      // Keep at least one chart visible.
      if (on && prev.length <= 1) return prev;
      const next = on ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        MixAppPrefs?.patch?.({ statsVisibleMetrics: next });
      } catch (_) {
        /* ignore */
      }
      return next;
    });
  }

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

  function metricColor(id) {
    return METRIC_COLORS[id] || "var(--spice-button, #1db954)";
  }

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

  function chartHint(metric) {
    return (
      CHART_HINTS[metric.id] ||
      ("Playlist order of " + metric.label + " for each track.")
    );
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
    // Percent / aggregate: 0 … playlist max%
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

  function seriesForMetric(metric) {
    const n = list.length;
    const points = [];
    if (metric.id === "aggChange") {
      for (let i = 0; i < n; i++) {
        const track = list[i];
        points.push({
          index: i,
          value: agg.values[i] ?? null,
          name: track?.name || "Unknown",
          artists: track?.artists || "",
        });
      }
      return {
        points,
        avgV: agg.avg,
        minV: agg.min,
        maxV: agg.max,
        extraMeta:
          agg.smoothness != null
            ? " · smooth " + formatChartValue(metric, agg.smoothness)
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

  function lineChart(metric) {
    const color = metricColor(metric.id);
    const n = list.length;
    const series = seriesForMetric(metric);
    const points = series.points;
    const rawValues = points.map((p) => p.value);
    const maValues = movingAverage(rawValues, MA_WINDOW);
    const known = rawValues.filter((v) => v != null);
    const { avgV, minV, maxV, extraMeta } = series;

    const domain = chartDomain(metric, known);
    const span = domain.max - domain.min || 1;

    const W = 560;
    const H = 176;
    const padL = 48;
    const padR = 10;
    const padT = 14;
    const padB = 22;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    function xAt(i) {
      if (n <= 1) return padL + plotW / 2;
      return padL + (i / (n - 1)) * plotW;
    }

    function yAt(v) {
      if (v == null) return null;
      const t = (Number(v) - domain.min) / span;
      return padT + plotH * (1 - Math.min(1, Math.max(0, t)));
    }

    function polylinePoints(values) {
      const pts = [];
      for (let i = 0; i < values.length; i++) {
        if (values[i] == null) continue;
        pts.push(xAt(i).toFixed(1) + "," + yAt(values[i]).toFixed(1));
      }
      return pts;
    }

    const rawPts = polylinePoints(rawValues);
    const maPts = polylinePoints(maValues);
    const dotR = n > 80 ? 2 : n > 40 ? 2.5 : 3.2;
    const mid = domain.min + span / 2;
    const yTicks = [domain.max, mid, domain.min];

    return react.createElement(
      "div",
      {
        key: metric.id,
        className:
          "mixapp-stats-chart" +
          (metric.id === "aggChange" ? " mixapp-stats-chart-agg" : ""),
      },
      react.createElement(
        "div",
        {
          className: "mixapp-stats-chart-head mixapp-tip mixapp-stats-chart-tip",
          "data-tip": chartHint(metric),
          tabIndex: 0,
          role: "note",
          "aria-label": metric.label + ": " + chartHint(metric),
        },
        react.createElement(
          "strong",
          { style: { color } },
          metric.label
        ),
        known.length
          ? react.createElement(
              "span",
              { className: "mixapp-recommend-meta" },
              "avg " +
                formatChartValue(metric, avgV) +
                " · " +
                formatChartValue(metric, minV) +
                "–" +
                formatChartValue(metric, maxV) +
                (extraMeta || "")
            )
          : react.createElement(
              "span",
              { className: "mixapp-recommend-meta" },
              "no data"
            )
      ),
      !known.length
        ? react.createElement(
            "div",
            { className: "mixapp-stats-line-empty" },
            metric.id === "aggChange"
              ? "Need at least two enriched tracks for transition change."
              : "No feature values for these tracks yet."
          )
        : react.createElement(
            "svg",
            {
              className: "mixapp-stats-line-svg",
              viewBox: "0 0 " + W + " " + H,
              preserveAspectRatio: "none",
              role: "img",
              "aria-label":
                metric.label + " across " + n + " tracks in playlist order",
            },
            react.createElement("rect", {
              className: "mixapp-stats-line-frame",
              x: padL,
              y: padT,
              width: plotW,
              height: plotH,
              rx: 4,
            }),
            yTicks.map((tick, ti) => {
              const y = yAt(tick);
              return react.createElement(
                "g",
                { key: "tick-" + ti },
                react.createElement("line", {
                  className: "mixapp-stats-line-grid",
                  x1: padL,
                  x2: padL + plotW,
                  y1: y,
                  y2: y,
                }),
                react.createElement(
                  "text",
                  {
                    className: "mixapp-stats-line-ylabel",
                    x: padL - 6,
                    y: y + 3,
                    textAnchor: "end",
                  },
                  formatChartValue(metric, tick)
                )
              );
            }),
            maPts.length > 1
              ? react.createElement("polyline", {
                  className: "mixapp-stats-line-ma",
                  fill: "none",
                  points: maPts.join(" "),
                  style: { stroke: color },
                })
              : null,
            rawPts.length > 1
              ? react.createElement("polyline", {
                  className: "mixapp-stats-line-path",
                  fill: "none",
                  points: rawPts.join(" "),
                  style: { stroke: color },
                })
              : null,
            points.map((p) => {
              if (p.value == null) return null;
              const cx = xAt(p.index);
              const cy = yAt(p.value);
              const ma = maValues[p.index];
              const label =
                "#" +
                (p.index + 1) +
                " " +
                p.name +
                (p.artists ? " — " + p.artists : "") +
                "\n" +
                metric.label +
                ": " +
                formatChartValue(metric, p.value) +
                (ma != null
                  ? "\n5-track avg: " + formatChartValue(metric, ma)
                  : "");
              return react.createElement(
                "circle",
                {
                  key: metric.id + "-" + p.index,
                  className: "mixapp-stats-line-dot",
                  cx,
                  cy,
                  r: dotR,
                  style: { fill: color, stroke: "var(--spice-card, #282828)" },
                },
                react.createElement("title", null, label)
              );
            }),
            react.createElement(
              "text",
              {
                className: "mixapp-stats-line-xlabel",
                x: padL,
                y: H - 4,
              },
              "1"
            ),
            react.createElement(
              "text",
              {
                className: "mixapp-stats-line-xlabel",
                x: padL + plotW,
                y: H - 4,
                textAnchor: "end",
              },
              String(n)
            )
          )
    );
  }

  return react.createElement(
    "section",
    { className: "mixapp-stats-panel", "aria-label": "Playlist stats" },
    react.createElement(
      "div",
      { className: "mixapp-stats-panel-header" },
      react.createElement(
        "div",
        { className: "mixapp-search-panel-title-row" },
        react.createElement("h2", null, "Stats"),
        react.createElement(
          "span",
          { className: "mixapp-recommend-meta" },
          stats.trackCount +
            " tracks" +
            (agg.smoothness != null
              ? " · smoothness " + formatChartValue(AGG_METRIC, agg.smoothness)
              : "")
        )
      ),
      react.createElement(
        "div",
        { className: "mixapp-stats-legend" },
        react.createElement(
          "span",
          { className: "mixapp-stats-legend-item mixapp-stats-legend-raw" },
          "Track values"
        ),
        react.createElement(
          "span",
          { className: "mixapp-stats-legend-item mixapp-stats-legend-ma" },
          "5-track avg"
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "mixapp-icon-btn",
            onClick: onClose,
            title: "Close stats",
            "aria-label": "Close stats",
          },
          "✕"
        )
      )
    ),

    react.createElement(
      "div",
      {
        className: "mixapp-camelot-moves mixapp-stats-metric-toggles",
        role: "group",
        "aria-label": "Show or hide feature charts",
      },
      allMetrics.map((metric) => {
        const selected = visibleIds.includes(metric.id);
        return react.createElement(
          "button",
          {
            key: metric.id,
            type: "button",
            className:
              "mixapp-camelot-chip mixapp-tip" + (selected ? " is-on" : ""),
            "data-tip":
              metric.id === "aggChange"
                ? "Absolute change between adjacent tracks (energy, dance, valence, acoustic, instr., speech, live, BPM compat, key)"
                : (selected ? "Hide" : "Show") + " " + metric.label + " chart",
            "aria-pressed": selected,
            onClick: () => toggleMetric(metric.id),
          },
          react.createElement(
            "span",
            { className: "mixapp-camelot-chip-label" },
            metric.label
          ),
          react.createElement(
            "span",
            { className: "mixapp-camelot-chip-example" },
            metricUnitHint(metric)
          )
        );
      })
    ),

    !list.length
      ? react.createElement(
          "p",
          { className: "mixapp-recommend-empty" },
          "Load a playlist to see charts."
        )
      : !chartMetrics.length
        ? react.createElement(
            "p",
            { className: "mixapp-recommend-empty" },
            "Turn on at least one feature above."
          )
        : react.createElement(
            "div",
            { className: "mixapp-stats-charts-grid" },
            chartMetrics.map(lineChart)
          )
  );
}
