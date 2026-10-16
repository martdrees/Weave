//@ts-check

/** Full-width search / filter bar (between toolbar and playlist table). */
function MixAppSearchPanel(props) {
  const react = Spicetify.React;
  const {
    open,
    seedUris,
    tracks,
    features,
    filters,
    resultLimit,
    loading,
    fitting,
    error,
    onClose,
    onFeaturesChange,
    onFiltersChange,
    onResultLimitChange,
    onFitToSeeds,
    onResetFeatures,
    onSearch,
  } = props;

  if (!open) return null;

  const defs = MixAppRecommend.FEATURE_DEFS;
  const seedCount = (seedUris || []).length;
  const seedNames = (tracks || [])
    .filter((t) => seedUris?.includes(t.uri))
    .map((t) => t.name)
    .slice(0, 8);

  function updateFeature(id, patch) {
    onFeaturesChange?.({
      ...features,
      [id]: { ...features[id], ...patch },
    });
  }

  function formatFeatureValue(def, value) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    const n = Number(value);
    if (def.kind === "tempo" || def.kind === "popularity") {
      return String(Math.round(n));
    }
    if (def.kind === "loudness") return n.toFixed(1);
    return n.toFixed(def.step < 0.1 ? 2 : 1);
  }

  function dualRange(def, range) {
    const minV = Number(range.min);
    const maxV = Number(range.max);
    const enabled = !!range.enabled;
    const span = def.max - def.min || 1;
    const leftPct = ((Math.min(minV, maxV) - def.min) / span) * 100;
    const rightPct = ((Math.max(minV, maxV) - def.min) / span) * 100;

    return react.createElement(
      "div",
      {
        className:
          "mixapp-dual-range" + (enabled ? "" : " is-disabled"),
      },
      react.createElement("div", {
        className: "mixapp-dual-range-track",
      }),
      react.createElement("div", {
        className: "mixapp-dual-range-fill",
        style: {
          left: leftPct + "%",
          width: Math.max(0, rightPct - leftPct) + "%",
        },
      }),
      react.createElement("input", {
        type: "range",
        className: "mixapp-dual-range-input mixapp-dual-range-min",
        min: def.min,
        max: def.max,
        step: def.step,
        disabled: !enabled,
        value: minV,
        "aria-label": def.label + " min",
        onChange: (e) => {
          let nextMin = Number(e.target.value);
          let nextMax = maxV;
          if (nextMin > nextMax) nextMax = nextMin;
          updateFeature(def.id, { min: nextMin, max: nextMax });
        },
      }),
      react.createElement("input", {
        type: "range",
        className: "mixapp-dual-range-input mixapp-dual-range-max",
        min: def.min,
        max: def.max,
        step: def.step,
        disabled: !enabled,
        value: maxV,
        "aria-label": def.label + " max",
        onChange: (e) => {
          let nextMax = Number(e.target.value);
          let nextMin = minV;
          if (nextMax < nextMin) nextMin = nextMax;
          updateFeature(def.id, { min: nextMin, max: nextMax });
        },
      })
    );
  }

  return react.createElement(
    "section",
    {
      className: "mixapp-search-panel",
      "aria-label": "Search filters",
    },
    react.createElement(
      "div",
      { className: "mixapp-search-panel-header" },
      react.createElement(
        "div",
        { className: "mixapp-search-panel-title-row" },
        react.createElement("h2", null, "Search"),
        react.createElement(
          "span",
          { className: "mixapp-recommend-meta" },
          seedCount
            ? seedCount +
                " seed" +
                (seedCount === 1 ? "" : "s") +
                (seedNames.length
                  ? ": " + seedNames.join(", ") + (seedCount > 8 ? "…" : "")
                  : "")
            : "Click tracks in the playlist to mark seeds"
        )
      ),
      react.createElement(
        "div",
        { className: "mixapp-search-panel-header-actions" },
        react.createElement(
          "button",
          {
            type: "button",
            className: "mixapp-btn mixapp-btn-ghost",
            onClick: onFitToSeeds,
            disabled: !seedCount || fitting,
            title: "Set min/max/target from selected seed audio features",
          },
          fitting ? "Fitting…" : "Fit to seeds"
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "mixapp-btn mixapp-btn-ghost",
            onClick: onResetFeatures,
          },
          "Reset ranges"
        ),
        react.createElement(
          "label",
          { className: "mixapp-result-limit" },
          "Max results",
          react.createElement(
            "select",
            {
              className: "mixapp-select mixapp-select-compact",
              value: resultLimit || MixAppRecommend.DEFAULT_LIMIT,
              onChange: (e) =>
                onResultLimitChange?.(Number(e.target.value)),
              disabled: loading,
            },
            [25, 50, 100, 150, 200].map((n) =>
              react.createElement("option", { key: n, value: n }, String(n))
            )
          )
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "mixapp-btn mixapp-btn-primary",
            onClick: onSearch,
            disabled: loading || !seedCount,
          },
          loading ? "Searching…" : "Search"
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "mixapp-icon-btn",
            onClick: onClose,
            title: "Close search",
            "aria-label": "Close search",
          },
          "✕"
        )
      )
    ),

    error
      ? react.createElement("div", { className: "mixapp-error" }, error)
      : null,

    react.createElement(
      "div",
      { className: "mixapp-search-panel-grid" },
      react.createElement(
        "div",
        { className: "mixapp-search-panel-block" },
        react.createElement("h3", null, "Feature ranges"),
        react.createElement(
          "div",
          { className: "mixapp-feature-sliders mixapp-feature-sliders-wide" },
          defs.map((def) => {
            const range = features[def.id] || {};
            return react.createElement(
              "div",
              {
                key: def.id,
                className:
                  "mixapp-feature-row" + (range.enabled ? " is-enabled" : ""),
              },
              react.createElement(
                "label",
                { className: "mixapp-feature-enable" },
                react.createElement("input", {
                  type: "checkbox",
                  checked: !!range.enabled,
                  onChange: (e) =>
                    updateFeature(def.id, { enabled: e.target.checked }),
                }),
                react.createElement("span", null, def.label)
              ),
              react.createElement(
                "div",
                { className: "mixapp-feature-controls" },
                dualRange(def, range),
                react.createElement(
                  "span",
                  {
                    className: "mixapp-feature-values",
                    title: "Min – max",
                  },
                  formatFeatureValue(def, range.min) +
                    "–" +
                    formatFeatureValue(def, range.max)
                ),
                react.createElement(
                  "label",
                  {
                    className: "mixapp-feature-target-toggle",
                    title: "Use target value",
                  },
                  react.createElement("input", {
                    type: "checkbox",
                    disabled: !range.enabled,
                    checked: !!range.useTarget,
                    onChange: (e) =>
                      updateFeature(def.id, { useTarget: e.target.checked }),
                  }),
                  "T"
                ),
                react.createElement("input", {
                  type: "range",
                  className: "mixapp-feature-target-slider",
                  title: "Target " + formatFeatureValue(def, range.target),
                  "aria-label": def.label + " target",
                  min: def.min,
                  max: def.max,
                  step: def.step,
                  disabled: !range.enabled || !range.useTarget,
                  value: range.target,
                  onChange: (e) =>
                    updateFeature(def.id, {
                      target: Number(e.target.value),
                    }),
                })
              )
            );
          })
        )
      ),
      react.createElement(
        "div",
        { className: "mixapp-search-panel-block" },
        react.createElement("h3", null, "Filters"),
        react.createElement(
          "div",
          { className: "mixapp-recommend-filters" },
          react.createElement(
            "label",
            { className: "mixapp-check" },
            react.createElement("input", {
              type: "checkbox",
              checked: filters.hideExisting,
              onChange: (e) =>
                onFiltersChange?.({
                  ...filters,
                  hideExisting: e.target.checked,
                }),
            }),
            "Hide tracks already in playlist"
          ),
          react.createElement(
            "label",
            { className: "mixapp-check" },
            react.createElement("input", {
              type: "checkbox",
              checked: filters.hideExistingArtists,
              onChange: (e) =>
                onFiltersChange?.({
                  ...filters,
                  hideExistingArtists: e.target.checked,
                }),
            }),
            "Hide existing artists"
          ),
          react.createElement(
            "label",
            { className: "mixapp-check" },
            react.createElement("input", {
              type: "checkbox",
              checked: filters.excludeExplicit,
              onChange: (e) =>
                onFiltersChange?.({
                  ...filters,
                  excludeExplicit: e.target.checked,
                }),
            }),
            "Exclude explicit"
          ),
          react.createElement(
            "label",
            { className: "mixapp-check" },
            react.createElement("input", {
              type: "checkbox",
              checked: filters.excludeAberrant,
              onChange: (e) =>
                onFiltersChange?.({
                  ...filters,
                  excludeAberrant: e.target.checked,
                }),
            }),
            "Exclude aberrant titles"
          ),
          react.createElement(
            "div",
            { className: "mixapp-camelot-filters" },
            react.createElement(
              "div",
              { className: "mixapp-camelot-filters-head" },
              react.createElement("h4", null, "Camelot / Mix In Key"),
              react.createElement(
                "span",
                { className: "mixapp-recommend-meta" },
                (() => {
                  const seeds = (tracks || [])
                    .filter((t) => seedUris?.includes(t.uri))
                    .map((t) => MixAppFeatures.parseCamelot(t)?.label)
                    .filter(Boolean);
                  const unique = [...new Set(seeds)];
                  return unique.length
                    ? "from " + unique.join(", ")
                    : "needs seed keys";
                })()
              )
            ),
            react.createElement(
              "p",
              { className: "mixapp-camelot-filters-hint" },
              "Relative to seed keys. Leave all off to skip key filtering."
            ),
            react.createElement(
              "div",
              { className: "mixapp-camelot-moves" },
              MixAppFeatures.CAMELOT_MOVES.map((move) => {
                const selected = Array.isArray(filters.camelotMoves)
                  ? filters.camelotMoves.includes(move.id)
                  : false;
                return react.createElement(
                  "label",
                  {
                    key: move.id,
                    className:
                      "mixapp-check mixapp-camelot-move" +
                      (selected ? " is-on" : ""),
                    title: move.hint + " · " + move.example,
                  },
                  react.createElement("input", {
                    type: "checkbox",
                    checked: selected,
                    onChange: (e) => {
                      const prev = Array.isArray(filters.camelotMoves)
                        ? filters.camelotMoves
                        : [];
                      const next = e.target.checked
                        ? [...new Set([...prev, move.id])]
                        : prev.filter((id) => id !== move.id);
                      onFiltersChange?.({ ...filters, camelotMoves: next });
                    },
                  }),
                  react.createElement(
                    "span",
                    { className: "mixapp-camelot-move-text" },
                    react.createElement(
                      "span",
                      { className: "mixapp-camelot-move-label" },
                      move.label
                    ),
                    react.createElement(
                      "span",
                      { className: "mixapp-camelot-move-example" },
                      move.example
                    )
                  )
                );
              })
            )
          ),
          react.createElement(
            "div",
            { className: "mixapp-year-row" },
            react.createElement(
              "label",
              { className: "mixapp-feature-field" },
              "Year from",
              react.createElement("input", {
                type: "number",
                placeholder: "e.g. 1990",
                value: filters.yearMin,
                onChange: (e) =>
                  onFiltersChange?.({ ...filters, yearMin: e.target.value }),
              })
            ),
            react.createElement(
              "label",
              { className: "mixapp-feature-field" },
              "Year to",
              react.createElement("input", {
                type: "number",
                placeholder: "e.g. 2024",
                value: filters.yearMax,
                onChange: (e) =>
                  onFiltersChange?.({ ...filters, yearMax: e.target.value }),
              })
            )
          )
        )
      )
    )
  );
}
