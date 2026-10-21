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
    { className: "mixapp-stats-panel", "aria-label": MixAppI18n.t("stats.title") },
    h(
      "div",
      { className: "mixapp-stats-panel-header" },
      h(
        "div",
        { className: "mixapp-search-panel-title-row" },
        h("h2", null, MixAppI18n.t("stats.title")),
        h(
          "span",
          { className: "mixapp-recommend-meta" },
          MixAppI18n.t("picker.tracks", { count: stats.trackCount }) +
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
          MixAppI18n.t("stats.legendRaw")
        ),
        h(
          "span",
          { className: "mixapp-stats-legend-item mixapp-stats-legend-ma" },
          MixAppI18n.t("stats.legendMa")
        ),
        h(
          "button",
          {
            type: "button",
            className: "mixapp-icon-btn",
            onClick: onClose,
            title: MixAppI18n.t("common.close"),
            "aria-label": MixAppI18n.t("common.close"),
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
        const accent = MixAppFeatures.featureColor(metric.id);
        return h(
          "button",
          {
            key: metric.id,
            type: "button",
            className: "mixapp-camelot-chip mixapp-tip" + (selected ? " is-on" : ""),
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
                  MixAppI18n.featureLabel(metric) +
                  " chart",
            "aria-pressed": selected,
            onClick: () => toggleMetric(metric.id),
          },
          h("span", {
            className: "mixapp-feature-swatch",
            style: { background: accent },
            "aria-hidden": "true",
          }),
          h(
            "span",
            { className: "mixapp-camelot-chip-label" },
            MixAppI18n.featureLabel(metric)
          ),
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
          MixAppI18n.t("stats.empty")
        )
      : !chartMetrics.length
        ? h(
            "p",
            { className: "mixapp-recommend-empty" },
            MixAppI18n.t("stats.pickMetric")
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
