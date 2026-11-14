/**
 * Single-metric playlist line chart (raw + moving average). R2.3.
 */

import React from "react";
import type { MetricDef } from "../../domain/metrics.ts";
import type { TrackRow } from "../../types/track.ts";
import * as Features from "../../api/features.ts";
import * as ChartConfig from "./chartConfig.ts";

export type LineChartProps = {
  metric: MetricDef | typeof ChartConfig.AGG_METRIC;
  tracks: TrackRow[];
  agg?: ReturnType<typeof Features.absoluteAggregateChange> | null;
  maWindow?: number;
};

export function LineChart(props: LineChartProps): React.ReactElement {
  const { metric, tracks, agg, maWindow } = props;
  const list = Array.isArray(tracks) ? tracks : [];
  const n = list.length;
  const windowSize = maWindow || ChartConfig.MA_WINDOW;
  const color = ChartConfig.metricColor(metric.id);
  const series = ChartConfig.seriesForMetric(metric, list, agg);
  const points = series.points;
  const rawValues = points.map((p) => p.value);
  const maValues = ChartConfig.movingAverage(rawValues, windowSize);
  const known = rawValues.filter((v): v is number => v != null);
  const { avgV, minV, maxV, extraMeta } = series;

  const domain = ChartConfig.chartDomain(metric, known);
  const span = domain.max - domain.min || 1;

  const W = 560;
  const H = 176;
  const padL = 48;
  const padR = 10;
  const padT = 14;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  function xAt(i: number): number {
    if (n <= 1) return padL + plotW / 2;
    return padL + (i / (n - 1)) * plotW;
  }

  function yAt(v: number | null): number | null {
    if (v == null) return null;
    const t = (Number(v) - domain.min) / span;
    return padT + plotH * (1 - Math.min(1, Math.max(0, t)));
  }

  function polylinePoints(values: Array<number | null>): string[] {
    const pts: string[] = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] == null) continue;
      const y = yAt(values[i]);
      if (y == null) continue;
      pts.push(xAt(i).toFixed(1) + "," + y.toFixed(1));
    }
    return pts;
  }

  const rawPts = polylinePoints(rawValues);
  const maPts = polylinePoints(maValues);
  const dotR = n > 80 ? 2 : n > 40 ? 2.5 : 3.2;
  const mid = domain.min + span / 2;
  const yTicks = [domain.max, mid, domain.min];
  const hint = ChartConfig.chartHint(metric);

  return (
    <div
      className={
        "weave-stats-chart" +
        (metric.id === "aggChange" ? " weave-stats-chart-agg" : "")
      }
    >
      <div
        className="weave-stats-chart-head weave-tip weave-stats-chart-tip"
        data-tip={hint}
        tabIndex={0}
        role="note"
        aria-label={metric.label + ": " + hint}
      >
        <strong style={{ color }}>{metric.label}</strong>
        {known.length ? (
          <span className="weave-recommend-meta">
            {"avg " +
              ChartConfig.formatChartValue(metric, avgV) +
              " · " +
              ChartConfig.formatChartValue(metric, minV) +
              "–" +
              ChartConfig.formatChartValue(metric, maxV) +
              (extraMeta || "")}
          </span>
        ) : (
          <span className="weave-recommend-meta">no data</span>
        )}
      </div>
      {!known.length ? (
        <div className="weave-stats-line-empty">
          {metric.id === "aggChange"
            ? "Need at least two enriched tracks for transition change."
            : "No feature values for these tracks yet."}
        </div>
      ) : (
        <svg
          className="weave-stats-line-svg"
          viewBox={"0 0 " + W + " " + H}
          preserveAspectRatio="none"
          role="img"
          aria-label={metric.label + " across " + n + " tracks in playlist order"}
        >
          <rect
            className="weave-stats-line-frame"
            x={padL}
            y={padT}
            width={plotW}
            height={plotH}
            rx={4}
          />
          {yTicks.map((tick, ti) => {
            const y = yAt(tick);
            if (y == null) return null;
            return (
              <g key={"tick-" + ti}>
                <line
                  className="weave-stats-line-grid"
                  x1={padL}
                  x2={padL + plotW}
                  y1={y}
                  y2={y}
                />
                <text
                  className="weave-stats-line-ylabel"
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                >
                  {ChartConfig.formatChartValue(metric, tick)}
                </text>
              </g>
            );
          })}
          {maPts.length > 1 ? (
            <polyline
              className="weave-stats-line-ma"
              fill="none"
              points={maPts.join(" ")}
              style={{ stroke: color }}
            />
          ) : null}
          {rawPts.length > 1 ? (
            <polyline
              className="weave-stats-line-path"
              fill="none"
              points={rawPts.join(" ")}
              style={{ stroke: color }}
            />
          ) : null}
          {points.map((p) => {
            if (p.value == null) return null;
            const cx = xAt(p.index);
            const cy = yAt(p.value);
            if (cy == null) return null;
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
              ChartConfig.formatChartValue(metric, p.value) +
              (ma != null
                ? "\n5-track avg: " + ChartConfig.formatChartValue(metric, ma)
                : "");
            return (
              <circle
                key={metric.id + "-" + p.index}
                className="weave-stats-line-dot"
                cx={cx}
                cy={cy}
                r={dotR}
                style={{ fill: color, stroke: "var(--spice-card, #282828)" }}
              >
                <title>{label}</title>
              </circle>
            );
          })}
          <text className="weave-stats-line-xlabel" x={padL} y={H - 4}>
            1
          </text>
          <text
            className="weave-stats-line-xlabel"
            x={padL + plotW}
            y={H - 4}
            textAnchor="end"
          >
            {String(n)}
          </text>
        </svg>
      )}
    </div>
  );
}
