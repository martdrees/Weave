//@ts-check
/**
 * Shared feature-range controls (dual-thumb slider + optional around-average).
 * Used by Search panel and Generator modal.
 * Filtering uses hard min/max only (no soft target ranking).
 */

/**
 * @param {{
 *   features: object,
 *   onChange: (next: object) => void,
 *   disabled?: boolean,
 *   defs?: object[],
 *   className?: string,
 *   seedTracks?: object[],
 *   seedAverages?: Record<string, number>,
 * }} props
 */
function MixAppFeatureSliders(props) {
  const {
    features,
    onChange,
    disabled = false,
    defs = MixAppRecommend.FEATURE_DEFS,
    className,
    seedTracks,
    seedAverages: seedAveragesProp,
  } = props || {};

  const seedAverages =
    seedAveragesProp ||
    (seedTracks?.length ? MixAppRecommend.averagesFromTracks(seedTracks) : {});

  function updateFeature(id, patch) {
    onChange?.({
      ...features,
      [id]: { ...features?.[id], ...patch },
    });
  }

  function resetRangeForDef(def) {
    return {
      enabled: false,
      aroundAvg: false,
      min: def.min,
      max: def.max,
    };
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

  function dualRange(def, range, seedAvg) {
    const minV = Number(range.min);
    const maxV = Number(range.max);
    const enabled = !!range.enabled && !disabled;
    const span = def.max - def.min || 1;
    const leftPct = ((Math.min(minV, maxV) - def.min) / span) * 100;
    const rightPct = ((Math.max(minV, maxV) - def.min) / span) * 100;
    const seedPct =
      seedAvg != null && Number.isFinite(Number(seedAvg))
        ? ((Number(seedAvg) - def.min) / span) * 100
        : null;
    const accent = MixAppFeatures.featureColor(def.id);
    const fill = MixAppFeatures.featureTint(def.id, enabled ? 0.72 : 0.28);

    return h(
      "div",
      {
        className: "mixapp-dual-range" + (enabled ? "" : " is-disabled"),
        style: { ["--mix-feature-accent"]: accent },
      },
      h("div", { className: "mixapp-dual-range-track" }),
      h("div", {
        className: "mixapp-dual-range-fill",
        style: {
          left: leftPct + "%",
          width: Math.max(0, rightPct - leftPct) + "%",
          background: fill,
        },
      }),
      seedPct != null
        ? h("div", {
            className: "mixapp-dual-range-seed",
            style: {
              left: Math.min(100, Math.max(0, seedPct)) + "%",
              background: accent,
            },
            title: "Average: " + formatFeatureValue(def, seedAvg),
            "aria-hidden": "true",
          })
        : null,
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
          updateFeature(def.id, {
            min: nextMin,
            max: nextMax,
            aroundAvg: false,
          });
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
          updateFeature(def.id, {
            min: nextMin,
            max: nextMax,
            aroundAvg: false,
          });
        },
      })
    );
  }

  return h(
    "div",
    {
      className:
        "mixapp-feature-sliders mixapp-feature-sliders-wide" +
        (className ? " " + className : ""),
    },
    (defs || []).map((def) => {
      const range = features?.[def.id] || {};
      const seedAvg = seedAverages?.[def.id];
      const hasAvg = seedAvg != null && Number.isFinite(Number(seedAvg));
      const accent = MixAppFeatures.featureColor(def.id);
      return h(
        "div",
        {
          key: def.id,
          className: "mixapp-feature-row" + (range.enabled ? " is-enabled" : ""),
          style: { ["--mix-feature-accent"]: accent },
        },
        h(
          "label",
          { className: "mixapp-feature-enable" },
          h("input", {
            type: "checkbox",
            checked: !!range.enabled,
            disabled,
            style: { accentColor: accent },
            onChange: (e) => {
              if (e.target.checked) {
                updateFeature(def.id, { enabled: true });
              } else {
                updateFeature(def.id, resetRangeForDef(def));
              }
            },
          }),
          h(
            "span",
            {
              className: "mixapp-feature-swatch",
              style: { background: accent },
              "aria-hidden": "true",
            }
          ),
          h("span", null, def.label)
        ),
        h(
          "div",
          { className: "mixapp-feature-controls" },
          dualRange(def, range, seedAvg),
          h(
            "span",
            {
              className: "mixapp-feature-values",
              title:
                seedAvg != null
                  ? "Min – max (avg " +
                    formatFeatureValue(def, seedAvg) +
                    ")"
                  : "Min – max",
            },
            formatFeatureValue(def, range.min) +
              "–" +
              formatFeatureValue(def, range.max)
          ),
          h(
            "label",
            {
              className: "mixapp-feature-around-toggle",
              title: hasAvg
                ? "Use target value: set min/max around the average"
                : "Average unavailable (need seeds or playlist features)",
            },
            h("input", {
              type: "checkbox",
              disabled: disabled || !hasAvg,
              checked: !!range.aroundAvg,
              onChange: (e) => {
                if (e.target.checked) {
                  const band = MixAppRecommend.rangeAroundValue(def, seedAvg);
                  updateFeature(def.id, {
                    enabled: true,
                    aroundAvg: true,
                    min: band.min,
                    max: band.max,
                  });
                } else {
                  updateFeature(def.id, {
                    aroundAvg: false,
                    min: def.min,
                    max: def.max,
                  });
                }
              },
            }),
            "Avg"
          )
        )
      );
    })
  );
}
