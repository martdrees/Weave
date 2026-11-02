//@ts-check

/** Playlist stats panel — toggles + chart grid (R2.3 primitives). */
function WeaveStatsPanel(props) {
  const react = Spicetify.React;
  const { open, tracks, onClose } = props;

  const allMetrics = WeaveChartConfig.allMetrics();
  const AGG_METRIC = WeaveChartConfig.AGG_METRIC;

  const [visibleIds, setVisibleIds] = react.useState(() => {
    const allIds = allMetrics.map((m) => m.id);
    // aggChange backfill lives in WeavePrefs.migrate (schema v2).
    const saved = WeavePrefs?.load?.()?.statsVisibleMetrics;
    if (Array.isArray(saved) && saved.length) {
      const allowed = new Set(allIds);
      const filtered = saved.filter((id) => allowed.has(id));
      if (filtered.length) return filtered;
    }
    return allIds;
  });

  if (!open) return null;

  const list = Array.isArray(tracks) ? tracks : [];
  const stats = WeaveFeatures.aggregateStats(list);
  const agg = WeaveFeatures.absoluteAggregateChange(list);
  const chartMetrics = allMetrics.filter((m) => visibleIds.includes(m.id));

  function toggleMetric(id) {
    setVisibleIds((prev) => {
      const on = prev.includes(id);
      // Keep at least one chart visible.
      if (on && prev.length <= 1) return prev;
      const next = on ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        WeavePrefs?.patch?.({ statsVisibleMetrics: next });
      } catch (_) {
        /* ignore */
      }
      return next;
    });
  }

  return h(
    "section",
    { className: "weave-stats-panel", "aria-label": WeaveI18n.t("stats.title") },
    h(
      "div",
      { className: "weave-stats-panel-header" },
      h(
        "div",
        { className: "weave-search-panel-title-row" },
        h("h2", null, WeaveI18n.t("stats.title")),
        h(
          "span",
          { className: "weave-recommend-meta" },
          WeaveI18n.t("picker.tracks", { count: stats.trackCount }) +
            (agg.smoothness != null
              ? " · smoothness " +
                WeaveChartConfig.formatChartValue(AGG_METRIC, agg.smoothness)
              : "")
        )
      ),
      h(
        "div",
        { className: "weave-stats-legend" },
        h(
          "span",
          { className: "weave-stats-legend-item weave-stats-legend-raw" },
          WeaveI18n.t("stats.legendRaw")
        ),
        h(
          "span",
          { className: "weave-stats-legend-item weave-stats-legend-ma" },
          WeaveI18n.t("stats.legendMa")
        ),
        h(
          "button",
          {
            type: "button",
            className: "weave-icon-btn",
            onClick: onClose,
            title: WeaveI18n.t("common.close"),
            "aria-label": WeaveI18n.t("common.close"),
          },
          "✕"
        )
      )
    ),

    h(
      "div",
      {
        className: "weave-camelot-moves weave-stats-metric-toggles",
        role: "group",
        "aria-label": "Show or hide feature charts",
      },
      allMetrics.map((metric) => {
        const selected = visibleIds.includes(metric.id);
        const accent = WeaveFeatures.featureColor(metric.id);
        return h(
          "button",
          {
            key: metric.id,
            type: "button",
            className: "weave-camelot-chip weave-tip" + (selected ? " is-on" : ""),
            style: selected
              ? {
                  borderColor: accent,
                  boxShadow: "inset 0 0 0 1px " + accent,
                }
              : undefined,
            "data-tip":
              metric.id === "aggChange"
                ? "Absolute change between adjacent tracks (energy, dance, valence, acoustic, instr., speech, live, BPM compat, key)"
                : (selected ? "Hide" : "Show") +
                  " " +
                  WeaveI18n.featureLabel(metric) +
                  " chart",
            "aria-pressed": selected,
            onClick: () => toggleMetric(metric.id),
          },
          h("span", {
            className: "weave-feature-swatch",
            style: { background: accent },
            "aria-hidden": "true",
          }),
          h(
            "span",
            { className: "weave-camelot-chip-label" },
            WeaveI18n.featureLabel(metric)
          ),
          h(
            "span",
            { className: "weave-camelot-chip-example" },
            WeaveChartConfig.metricUnitHint(metric)
          )
        );
      })
    ),

    !list.length
      ? h("p", { className: "weave-recommend-empty" }, WeaveI18n.t("stats.empty"))
      : !chartMetrics.length
        ? h(
            "p",
            { className: "weave-recommend-empty" },
            WeaveI18n.t("stats.pickMetric")
          )
        : h(
            "div",
            { className: "weave-stats-charts-grid" },
            chartMetrics.map((metric) =>
              h(WeaveLineChart, {
                key: metric.id,
                metric,
                tracks: list,
                agg,
              })
            )
          )
  );
}
