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
  const hasPlaylistTracks = Array.isArray(tracks) && tracks.length > 0;
  const canSearch = seedCount > 0 || hasPlaylistTracks;
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

    return h(
      "div",
      {
        className:
          "mixapp-dual-range" + (enabled ? "" : " is-disabled"),
      },
      h("div", {
        className: "mixapp-dual-range-track",
      }),
      h("div", {
        className: "mixapp-dual-range-fill",
        style: {
          left: leftPct + "%",
          width: Math.max(0, rightPct - leftPct) + "%",
        },
      }),
      h("input", {
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
      h("input", {
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

  return h(
    "section",
    {
      className: "mixapp-search-panel",
      "aria-label": "Search filters",
    },
    h(
      "div",
      { className: "mixapp-search-panel-header" },
      h(
        "div",
        { className: "mixapp-search-panel-title-row" },
        h("h2", null, "Search"),
        h(
          "span",
          { className: "mixapp-recommend-meta" },
          seedCount
            ? seedCount +
                " seed" +
                (seedCount === 1 ? "" : "s") +
                (seedNames.length
                  ? ": " + seedNames.join(", ") + (seedCount > 8 ? "…" : "")
                  : "")
            : hasPlaylistTracks
              ? "No seeds — searching from this playlist"
              : "Load a playlist or mark seed tracks"
        )
      ),
      h(
        "div",
        { className: "mixapp-search-panel-header-actions" },
        h(
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
        h(
          "button",
          {
            type: "button",
            className: "mixapp-btn mixapp-btn-ghost",
            onClick: onResetFeatures,
          },
          "Reset ranges"
        ),
        h(
          "label",
          { className: "mixapp-result-limit" },
          "Max results",
          h(
            "select",
            {
              className: "mixapp-select mixapp-select-compact",
              value: resultLimit || MixAppRecommend.DEFAULT_LIMIT,
              onChange: (e) =>
                onResultLimitChange?.(Number(e.target.value)),
              disabled: loading,
            },
            [25, 50, 100, 150, 200].map((n) =>
              h("option", { key: n, value: n }, String(n))
            )
          )
        ),
        h(
          "button",
          {
            type: "button",
            className: "mixapp-btn mixapp-btn-primary",
            onClick: onSearch,
            disabled: loading || !canSearch,
            title: canSearch
              ? seedCount
                ? "Search from marked seed tracks"
                : "Search using this playlist as context (no seeds marked)"
              : "Load a playlist or mark seed tracks",
          },
          loading ? "Searching…" : "Search"
        ),
        h(
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
      ? h("div", { className: "mixapp-error" }, error)
      : null,

    h(
      "div",
      { className: "mixapp-search-panel-body" },
      h(
        "div",
        { className: "mixapp-search-panel-block" },
        h("h3", null, "Feature ranges"),
        h(
          "div",
          { className: "mixapp-feature-sliders mixapp-feature-sliders-wide" },
          defs.map((def) => {
            const range = features[def.id] || {};
            return h(
              "div",
              {
                key: def.id,
                className:
                  "mixapp-feature-row" + (range.enabled ? " is-enabled" : ""),
              },
              h(
                "label",
                { className: "mixapp-feature-enable" },
                h("input", {
                  type: "checkbox",
                  checked: !!range.enabled,
                  onChange: (e) =>
                    updateFeature(def.id, { enabled: e.target.checked }),
                }),
                h("span", null, def.label)
              ),
              h(
                "div",
                { className: "mixapp-feature-controls" },
                dualRange(def, range),
                h(
                  "span",
                  {
                    className: "mixapp-feature-values",
                    title: "Min – max",
                  },
                  formatFeatureValue(def, range.min) +
                    "–" +
                    formatFeatureValue(def, range.max)
                ),
                h(
                  "label",
                  {
                    className: "mixapp-feature-target-toggle",
                    title: "Use target value",
                  },
                  h("input", {
                    type: "checkbox",
                    disabled: !range.enabled,
                    checked: !!range.useTarget,
                    onChange: (e) =>
                      updateFeature(def.id, { useTarget: e.target.checked }),
                  }),
                  "T"
                ),
                h("input", {
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

      h(
        "div",
        { className: "mixapp-search-panel-block mixapp-camelot-block" },
        h(
          "div",
          { className: "mixapp-camelot-filters-head" },
          h(
            "h3",
            {
              className: "mixapp-tip",
              "data-tip":
                "Keep results that mix harmonically with your seed (or playlist) keys on the Camelot wheel. Select any combination — a track matches if any selected move reaches it. Leave all off to skip key filtering.",
            },
            "Mix in key"
          ),
          h(
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
                : seedCount
                  ? "needs seed keys · leave all off to skip"
                  : hasPlaylistTracks
                    ? "from playlist keys · leave all off to skip"
                    : "needs keys · leave all off to skip";
            })()
          )
        ),
        h(
          "div",
          { className: "mixapp-camelot-moves", role: "group", "aria-label": "Camelot moves" },
          MixAppFeatures.CAMELOT_MOVES.map((move) => {
            const selected = Array.isArray(filters.camelotMoves)
              ? filters.camelotMoves.includes(move.id)
              : false;
            return h(
              "button",
              {
                key: move.id,
                type: "button",
                className:
                  "mixapp-camelot-chip mixapp-tip" + (selected ? " is-on" : ""),
                "data-tip": move.hint + " · Example: " + move.example,
                "aria-pressed": selected,
                onClick: () => {
                  const prev = Array.isArray(filters.camelotMoves)
                    ? filters.camelotMoves
                    : [];
                  const next = selected
                    ? prev.filter((id) => id !== move.id)
                    : [...new Set([...prev, move.id])];
                  onFiltersChange?.({ ...filters, camelotMoves: next });
                },
              },
              h(
                "span",
                { className: "mixapp-camelot-chip-label" },
                move.label
              ),
              h(
                "span",
                { className: "mixapp-camelot-chip-example" },
                move.example
              )
            );
          })
        )
      ),

      h(
        "div",
        { className: "mixapp-search-panel-block mixapp-filters-bar" },
        h(
          "h3",
          {
            className: "mixapp-tip",
            "data-tip":
              "Post-filters applied after candidates are fetched. They remove tracks that don’t match these rules.",
          },
          "Filters"
        ),
        h(
          "div",
          { className: "mixapp-filters-row" },
          h(
            "div",
            {
              className: "mixapp-camelot-moves mixapp-filter-chips",
              role: "group",
              "aria-label": "Result filters",
            },
            [
              {
                key: "hideExisting",
                label: "Hide in playlist",
                tip: "Hide tracks that are already in the current playlist so results only suggest new additions.",
                on: !!filters.hideExisting,
                toggle: () =>
                  onFiltersChange?.({
                    ...filters,
                    hideExisting: !filters.hideExisting,
                  }),
              },
              {
                key: "hideExistingArtists",
                label: "Hide artists",
                tip: "Hide any track by an artist who already appears on the playlist — useful for more variety.",
                on: !!filters.hideExistingArtists,
                toggle: () =>
                  onFiltersChange?.({
                    ...filters,
                    hideExistingArtists: !filters.hideExistingArtists,
                  }),
              },
              {
                key: "excludeExplicit",
                label: "No explicit",
                tip: "Exclude tracks marked explicit by Spotify.",
                on: !!filters.excludeExplicit,
                toggle: () =>
                  onFiltersChange?.({
                    ...filters,
                    excludeExplicit: !filters.excludeExplicit,
                  }),
              },
              {
                key: "excludeAberrant",
                label: "No aberrant",
                tip: "Exclude odd versions and mix titles — sped up, slowed + reverb, nightcore, DJ/continuous mixes, TikTok edits, and similar.",
                on: !!filters.excludeAberrant,
                toggle: () =>
                  onFiltersChange?.({
                    ...filters,
                    excludeAberrant: !filters.excludeAberrant,
                  }),
              },
            ].map((f) =>
              h(
                "button",
                {
                  key: f.key,
                  type: "button",
                  className:
                    "mixapp-camelot-chip mixapp-tip" + (f.on ? " is-on" : ""),
                  "data-tip": f.tip,
                  "aria-pressed": f.on,
                  onClick: f.toggle,
                },
                h(
                  "span",
                  { className: "mixapp-camelot-chip-label" },
                  f.label
                )
              )
            )
          ),
          h(
            "div",
            { className: "mixapp-filters-end" },
            h(
              "div",
              {
                className: "mixapp-year-row mixapp-tip",
                "data-tip":
                  "Only keep tracks whose album release year falls between these values. Leave blank for no year limit.",
              },
              h(
                "label",
                { className: "mixapp-feature-field" },
                "Year",
                h("input", {
                  type: "number",
                  placeholder: "from",
                  value: filters.yearMin,
                  onChange: (e) =>
                    onFiltersChange?.({ ...filters, yearMin: e.target.value }),
                })
              ),
              h(
                "label",
                { className: "mixapp-feature-field" },
                "\u00a0",
                h("input", {
                  type: "number",
                  placeholder: "to",
                  value: filters.yearMax,
                  onChange: (e) =>
                    onFiltersChange?.({ ...filters, yearMax: e.target.value }),
                })
              )
            )
          )
        )
      )
    )
  );
}
