//@ts-check
/**
 * Single-metric playlist line chart (raw + moving average). R2.3.
 *
 * @param {{
 *   metric: object,
 *   tracks: object[],
 *   agg?: object|null,
 *   maWindow?: number,
 * }} props
 */
function WeaveLineChart(props) {
  const react = Spicetify.React;
  const { metric, tracks, agg, maWindow } = props || {};
  const list = Array.isArray(tracks) ? tracks : [];
  const n = list.length;
  const windowSize = maWindow || WeaveChartConfig.MA_WINDOW;
  const color = WeaveChartConfig.metricColor(metric.id);
  const series = WeaveChartConfig.seriesForMetric(metric, list, agg);
  const points = series.points;
  const rawValues = points.map((p) => p.value);
  const maValues = WeaveChartConfig.movingAverage(rawValues, windowSize);
  const known = rawValues.filter((v) => v != null);
  const { avgV, minV, maxV, extraMeta } = series;

  const domain = WeaveChartConfig.chartDomain(metric, known);
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
  const hint = WeaveChartConfig.chartHint(metric);

  return h(
    "div",
    {
      className:
        "weave-stats-chart" +
        (metric.id === "aggChange" ? " weave-stats-chart-agg" : ""),
    },
    h(
      "div",
      {
        className: "weave-stats-chart-head weave-tip weave-stats-chart-tip",
        "data-tip": hint,
        tabIndex: 0,
        role: "note",
        "aria-label": metric.label + ": " + hint,
      },
      h("strong", { style: { color } }, metric.label),
      known.length
        ? h(
            "span",
            { className: "weave-recommend-meta" },
            "avg " +
              WeaveChartConfig.formatChartValue(metric, avgV) +
              " · " +
              WeaveChartConfig.formatChartValue(metric, minV) +
              "–" +
              WeaveChartConfig.formatChartValue(metric, maxV) +
              (extraMeta || "")
          )
        : h("span", { className: "weave-recommend-meta" }, "no data")
    ),
    !known.length
      ? h(
          "div",
          { className: "weave-stats-line-empty" },
          metric.id === "aggChange"
            ? "Need at least two enriched tracks for transition change."
            : "No feature values for these tracks yet."
        )
      : h(
          "svg",
          {
            className: "weave-stats-line-svg",
            viewBox: "0 0 " + W + " " + H,
            preserveAspectRatio: "none",
            role: "img",
            "aria-label": metric.label + " across " + n + " tracks in playlist order",
          },
          h("rect", {
            className: "weave-stats-line-frame",
            x: padL,
            y: padT,
            width: plotW,
            height: plotH,
            rx: 4,
          }),
          yTicks.map((tick, ti) => {
            const y = yAt(tick);
            return h(
              "g",
              { key: "tick-" + ti },
              h("line", {
                className: "weave-stats-line-grid",
                x1: padL,
                x2: padL + plotW,
                y1: y,
                y2: y,
              }),
              h(
                "text",
                {
                  className: "weave-stats-line-ylabel",
                  x: padL - 6,
                  y: y + 3,
                  textAnchor: "end",
                },
                WeaveChartConfig.formatChartValue(metric, tick)
              )
            );
          }),
          maPts.length > 1
            ? h("polyline", {
                className: "weave-stats-line-ma",
                fill: "none",
                points: maPts.join(" "),
                style: { stroke: color },
              })
            : null,
          rawPts.length > 1
            ? h("polyline", {
                className: "weave-stats-line-path",
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
              WeaveChartConfig.formatChartValue(metric, p.value) +
              (ma != null
                ? "\n5-track avg: " + WeaveChartConfig.formatChartValue(metric, ma)
                : "");
            return h(
              "circle",
              {
                key: metric.id + "-" + p.index,
                className: "weave-stats-line-dot",
                cx,
                cy,
                r: dotR,
                style: { fill: color, stroke: "var(--spice-card, #282828)" },
              },
              h("title", null, label)
            );
          }),
          h(
            "text",
            {
              className: "weave-stats-line-xlabel",
              x: padL,
              y: H - 4,
            },
            "1"
          ),
          h(
            "text",
            {
              className: "weave-stats-line-xlabel",
              x: padL + plotW,
              y: H - 4,
              textAnchor: "end",
            },
            String(n)
          )
        )
  );
}
