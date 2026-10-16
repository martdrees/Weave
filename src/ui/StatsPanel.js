//@ts-check

function MixAppStatsPanel(props) {
  const react = Spicetify.React;
  const { open, tracks, onClose } = props;

  if (!open) return null;

  const stats = MixAppFeatures.aggregateStats(tracks || []);
  const chartMetrics = MixAppFeatures.METRICS.filter((m) =>
    ["energy", "danceability", "valence", "acousticness", "tempo"].includes(
      m.id
    )
  );

  function barRow(metric) {
    const block = stats.metrics[metric.id];
    const values = block?.values || [];
    const bins = MixAppFeatures.histogram(values, 12, metric.kind);
    const maxBin = Math.max(1, ...bins);
    return react.createElement(
      "div",
      { key: metric.id, className: "mixapp-stats-chart" },
      react.createElement(
        "div",
        { className: "mixapp-stats-chart-head" },
        react.createElement("strong", null, metric.label),
        block?.count
          ? react.createElement(
              "span",
              { className: "mixapp-recommend-meta" },
              "avg " + MixAppFeatures.formatMetric(metric, block.avg) +
                " · " +
                MixAppFeatures.formatMetric(metric, block.min) +
                "–" +
                MixAppFeatures.formatMetric(metric, block.max)
            )
          : react.createElement(
              "span",
              { className: "mixapp-recommend-meta" },
              "no data"
            )
      ),
      react.createElement(
        "div",
        { className: "mixapp-stats-bars", "aria-hidden": "true" },
        bins.map((count, i) =>
          react.createElement("div", {
            key: i,
            className: "mixapp-stats-bar",
            style: {
              height: Math.max(2, Math.round((count / maxBin) * 48)) + "px",
              opacity: count ? 0.45 + (count / maxBin) * 0.55 : 0.15,
            },
            title: String(count),
          })
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
            " tracks · feature cache " +
            MixAppFeatures.cacheSize()
        )
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
    ),

    react.createElement(
      "div",
      { className: "mixapp-stats-grid" },
      react.createElement(
        "div",
        { className: "mixapp-stats-block" },
        react.createElement("h3", null, "Feature distributions"),
        !(tracks || []).length
          ? react.createElement(
              "p",
              { className: "mixapp-recommend-empty" },
              "Load a playlist to see charts."
            )
          : chartMetrics.map(barRow)
      ),
      react.createElement(
        "div",
        { className: "mixapp-stats-block" },
        react.createElement("h3", null, "Summary"),
        react.createElement(
          "table",
          { className: "mixapp-stats-table" },
          react.createElement(
            "thead",
            null,
            react.createElement(
              "tr",
              null,
              react.createElement("th", null, "Feature"),
              react.createElement("th", null, "Avg"),
              react.createElement("th", null, "Min"),
              react.createElement("th", null, "Max"),
              react.createElement("th", null, "n")
            )
          ),
          react.createElement(
            "tbody",
            null,
            MixAppFeatures.METRICS.map((metric) => {
              const block = stats.metrics[metric.id];
              return react.createElement(
                "tr",
                { key: metric.id },
                react.createElement("td", null, metric.label),
                react.createElement(
                  "td",
                  null,
                  MixAppFeatures.formatMetric(metric, block?.avg)
                ),
                react.createElement(
                  "td",
                  null,
                  MixAppFeatures.formatMetric(metric, block?.min)
                ),
                react.createElement(
                  "td",
                  null,
                  MixAppFeatures.formatMetric(metric, block?.max)
                ),
                react.createElement("td", null, String(block?.count || 0))
              );
            })
          )
        ),
        react.createElement("h3", { className: "mixapp-stats-subhead" }, "Top keys"),
        react.createElement(
          "ul",
          { className: "mixapp-stats-keys" },
          (stats.topKeys || []).map((row) =>
            react.createElement(
              "li",
              { key: row.key },
              react.createElement("span", null, row.key),
              react.createElement("span", null, String(row.count))
            )
          )
        )
      )
    )
  );
}
