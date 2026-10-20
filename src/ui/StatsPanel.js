//@ts-check

/** Playlist stats panel — toggles + chart grid (R2.3 primitives). */
function MixAppStatsPanel(props) {
  const react = Spicetify.React;
  const { open, tracks, onClose } = props;

  const allMetrics = MixAppChartConfig.allMetrics();
  const AGG_METRIC = MixAppChartConfig.AGG_METRIC;

  const [visibleIds, setVisibleIds] = react.useState(() => {
    const allIds = allMetrics.map((m) => m.id);
    // aggChange backfill lives in MixAppPrefs.migrate (schema v2).
    const saved = MixAppPrefs?.load?.()?.statsVisibleMetrics;
    if (Array.isArray(saved) && saved.length) {
      const allowed = new Set(allIds);
      const filtered = saved.filter((id) => allowed.has(id));
      if (filtered.length) return filtered;
    }
    return allIds;
  });

  if (!open) return null;

  const list = Array.isArray(tracks) ? tracks : [];
  const stats = MixAppFeatures.aggregateStats(list);
  const agg = MixAppFeatures.absoluteAggregateChange(list);
  const chartMetrics = allMetrics.filter((m) => visibleIds.includes(m.id));

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

  return h(
    "section",
    { className: "mixapp-stats-panel", "aria-label": "Playlist stats" },
    h(
      "div",
      { className: "mixapp-stats-panel-header" },
      h(
        "div",
        { className: "mixapp-search-panel-title-row" },
        h("h2", null, "Stats"),
        h(
          "span",
          { className: "mixapp-recommend-meta" },
          stats.trackCount +
            " tracks" +
            (agg.smoothness != null
              ? " · smoothness " +
                MixAppChartConfig.formatChartValue(AGG_METRIC, agg.smoothness)
              : "")
        )
      ),
      h(
        "div",
        { className: "mixapp-stats-legend" },
        h(
          "span",
          { className: "mixapp-stats-legend-item mixapp-stats-legend-raw" },
          "Track values"
        ),
        h(
          "span",
          { className: "mixapp-stats-legend-item mixapp-stats-legend-ma" },
          "5-track avg"
        ),
        h(
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

    h(
      "div",
      {
        className: "mixapp-camelot-moves mixapp-stats-metric-toggles",
        role: "group",
        "aria-label": "Show or hide feature charts",
      },
      allMetrics.map((metric) => {
        const selected = visibleIds.includes(metric.id);
        return h(
          "button",
          {
            key: metric.id,
            type: "button",
            className: "mixapp-camelot-chip mixapp-tip" + (selected ? " is-on" : ""),
            "data-tip":
              metric.id === "aggChange"
                ? "Absolute change between adjacent tracks (energy, dance, valence, acoustic, instr., speech, live, BPM compat, key)"
                : (selected ? "Hide" : "Show") + " " + metric.label + " chart",
            "aria-pressed": selected,
            onClick: () => toggleMetric(metric.id),
          },
          h("span", { className: "mixapp-camelot-chip-label" }, metric.label),
          h(
            "span",
            { className: "mixapp-camelot-chip-example" },
            MixAppChartConfig.metricUnitHint(metric)
          )
        );
      })
    ),

    !list.length
      ? h(
          "p",
          { className: "mixapp-recommend-empty" },
          "Load a playlist to see charts."
        )
      : !chartMetrics.length
        ? h(
            "p",
            { className: "mixapp-recommend-empty" },
            "Turn on at least one feature above."
          )
        : h(
            "div",
            { className: "mixapp-stats-charts-grid" },
            chartMetrics.map((metric) =>
              h(MixAppLineChart, {
                key: metric.id,
                metric,
                tracks: list,
                agg,
              })
            )
          )
  );
}
