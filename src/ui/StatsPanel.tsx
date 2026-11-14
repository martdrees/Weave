/** Playlist stats panel — toggles + chart grid (R2.3 primitives). */

import React from "react";
import { t, featureLabel } from "../i18n/index.ts";
import * as Features from "../api/features.ts";
import * as Prefs from "../state/prefsStore.ts";
import type { TrackRow } from "../types/track.ts";
import * as ChartConfig from "./charts/chartConfig.ts";
import { LineChart } from "./charts/LineChart.tsx";

export type StatsPanelProps = {
  open: boolean;
  tracks?: TrackRow[] | null;
  onClose?: () => void;
};

export function StatsPanel(props: StatsPanelProps): React.ReactElement | null {
  const { open, tracks, onClose } = props;

  const allMetrics = ChartConfig.allMetrics();
  const AGG_METRIC = ChartConfig.AGG_METRIC;

  const [visibleIds, setVisibleIds] = React.useState<string[]>(() => {
    const allIds = allMetrics.map((m) => m.id);
    const saved = Prefs.load()?.statsVisibleMetrics;
    if (Array.isArray(saved) && saved.length) {
      const allowed = new Set(allIds);
      const filtered = saved.filter((id) => allowed.has(id));
      if (filtered.length) return filtered;
    }
    return allIds;
  });

  if (!open) return null;

  const list = Array.isArray(tracks) ? tracks : [];
  const stats = Features.aggregateStats(list);
  const agg = Features.absoluteAggregateChange(list);
  const chartMetrics = allMetrics.filter((m) => visibleIds.includes(m.id));

  function toggleMetric(id: string): void {
    setVisibleIds((prev) => {
      const on = prev.includes(id);
      if (on && prev.length <= 1) return prev;
      const next = on ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        Prefs.patch({ statsVisibleMetrics: next });
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <section className="weave-stats-panel" aria-label={t("stats.title")}>
      <div className="weave-stats-panel-header">
        <div className="weave-search-panel-title-row">
          <h2>{t("stats.title")}</h2>
          <span className="weave-recommend-meta">
            {t("picker.tracks", { count: stats.trackCount }) +
              (agg.smoothness != null
                ? " · smoothness " +
                  ChartConfig.formatChartValue(AGG_METRIC, agg.smoothness)
                : "")}
          </span>
        </div>
        <div className="weave-stats-legend">
          <span className="weave-stats-legend-item weave-stats-legend-raw">
            {t("stats.legendRaw")}
          </span>
          <span className="weave-stats-legend-item weave-stats-legend-ma">
            {t("stats.legendMa")}
          </span>
          <button
            type="button"
            className="weave-icon-btn"
            onClick={onClose}
            title={t("common.close")}
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>
      </div>

      <div
        className="weave-camelot-moves weave-stats-metric-toggles"
        role="group"
        aria-label="Show or hide feature charts"
      >
        {allMetrics.map((metric) => {
          const selected = visibleIds.includes(metric.id);
          const accent = Features.featureColor(metric.id);
          return (
            <button
              key={metric.id}
              type="button"
              className={"weave-camelot-chip weave-tip" + (selected ? " is-on" : "")}
              style={
                selected
                  ? {
                      borderColor: accent,
                      boxShadow: "inset 0 0 0 1px " + accent,
                    }
                  : undefined
              }
              data-tip={
                metric.id === "aggChange"
                  ? "Absolute change between adjacent tracks (energy, dance, valence, acoustic, instr., speech, live, BPM compat, key)"
                  : (selected ? "Hide" : "Show") + " " + featureLabel(metric) + " chart"
              }
              aria-pressed={selected}
              onClick={() => toggleMetric(metric.id)}
            >
              <span
                className="weave-feature-swatch"
                style={{ background: accent }}
                aria-hidden="true"
              />
              <span className="weave-camelot-chip-label">{featureLabel(metric)}</span>
              <span className="weave-camelot-chip-example">
                {ChartConfig.metricUnitHint(metric)}
              </span>
            </button>
          );
        })}
      </div>

      {!list.length ? (
        <p className="weave-recommend-empty">{t("stats.empty")}</p>
      ) : !chartMetrics.length ? (
        <p className="weave-recommend-empty">{t("stats.pickMetric")}</p>
      ) : (
        <div className="weave-stats-charts-grid">
          {chartMetrics.map((metric) => (
            <LineChart key={metric.id} metric={metric} tracks={list} agg={agg} />
          ))}
        </div>
      )}
    </section>
  );
}
