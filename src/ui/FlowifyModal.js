//@ts-check

/** Phase 6 — Flowify: rearrange current playlist by curves or sets. */
function MixAppFlowifyModal(props) {
  const react = Spicetify.React;
  const { open, tracks, onClose, onApply } = props;

  const [options, setOptions] = react.useState(() => {
    const saved = MixAppPrefs?.load?.()?.flowify;
    return saved
      ? { ...MixAppFlowify.defaultOptions(), ...saved }
      : MixAppFlowify.defaultOptions();
  });
  const [busy, setBusy] = react.useState(false);
  const [error, setError] = react.useState(null);

  react.useEffect(() => {
    if (!open) {
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const count = Array.isArray(tracks) ? tracks.length : 0;
  const active = MixAppFlowify.activeWeights(options.weights);

  function patch(partial) {
    setOptions((prev) => ({ ...prev, ...partial }));
  }

  function setWeight(id, value) {
    setOptions((prev) => ({
      ...prev,
      weights: { ...prev.weights, [id]: Number(value) },
    }));
  }

  function toggleInvert(id) {
    setOptions((prev) => ({
      ...prev,
      invert: { ...prev.invert, [id]: !prev.invert?.[id] },
    }));
  }

  async function handleApply() {
    if (!count) {
      setError(MixAppI18n.t("flowify.needPlaylist"));
      return;
    }
    if (!active.length) {
      setError(MixAppI18n.t("flowify.needWeight"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Ensure features exist for weighting.
      let list = (tracks || []).slice();
      try {
        list = await MixAppFeatures.enrichTracks(list);
      } catch (err) {
        console.warn("Weave Flowify enrich", err);
      }
      const next = MixAppFlowify.arrange(list, options);
      try {
        MixAppPrefs?.patch?.({ flowify: options });
      } catch (_) {
        /* ignore */
      }
      onApply?.(next);
      MixAppApi.notify(
        options.method === "curves"
          ? MixAppI18n.t("flowify.doneCurves")
          : MixAppI18n.t("flowify.doneSets")
      );
      onClose?.();
    } catch (err) {
      console.error(err);
      setError(err?.message || MixAppI18n.t("flowify.failed"));
    } finally {
      setBusy(false);
    }
  }

  return h(
    MixAppModal,
    {
      open,
      title: MixAppI18n.t("flowify.title"),
      meta: MixAppI18n.t("picker.tracks", { count }),
      onClose,
      ariaLabel: MixAppI18n.t("flowify.title"),
      className: "mixapp-find-modal mixapp-flowify-modal",
      closeDisabled: busy,
    },
    h(
      "div",
      { className: "mixapp-flowify-body" },
      h(
        "p",
        { className: "mixapp-recommend-meta" },
        MixAppI18n.t("flowify.blurb")
      ),
      h(
        "div",
        { className: "mixapp-copy-tabs" },
        h(
          "button",
          {
            type: "button",
            className:
              "mixapp-btn mixapp-btn-ghost" +
              (options.method === "sets" ? " mixapp-btn-active" : ""),
            onClick: () => patch({ method: "sets" }),
          },
          MixAppI18n.t("flowify.sets")
        ),
        h(
          "button",
          {
            type: "button",
            className:
              "mixapp-btn mixapp-btn-ghost" +
              (options.method === "curves" ? " mixapp-btn-active" : ""),
            onClick: () => patch({ method: "curves" }),
          },
          MixAppI18n.t("flowify.curves")
        )
      ),
      options.method === "sets"
        ? h(
            "label",
            { className: "mixapp-flowify-field" },
            h("span", null, MixAppI18n.t("flowify.setSize")),
            h("input", {
              type: "number",
              className: "mixapp-find-input",
              min: 2,
              max: 20,
              value: options.setSize,
              onChange: (e) =>
                patch({
                  setSize: Math.max(2, Math.min(20, parseInt(e.target.value, 10) || 4)),
                }),
            })
          )
        : h(
            "label",
            { className: "mixapp-flowify-field" },
            h("span", null, MixAppI18n.t("flowify.curveShape")),
            h(
              "select",
              {
                className: "mixapp-find-input",
                value: options.curvePreset,
                onChange: (e) => patch({ curvePreset: e.target.value }),
              },
              MixAppFlowify.CURVE_PRESETS.map((p) =>
                h("option", { key: p.id, value: p.id }, p.label)
              )
            )
          ),
      h(
        "div",
        { className: "mixapp-flowify-weights" },
        h("h3", null, MixAppI18n.t("flowify.weights")),
        MixAppFlowify.FEATURE_IDS.map((id) =>
          h(
            "div",
            { key: id, className: "mixapp-flowify-weight-row" },
            h(
              "span",
              { className: "mixapp-flowify-weight-label" },
              MixAppI18n.featureLabel(id)
            ),
            h("input", {
              type: "range",
              min: 0,
              max: 100,
              step: 5,
              value: options.weights[id] || 0,
              onChange: (e) => setWeight(id, e.target.value),
              "aria-label": MixAppI18n.featureLabel(id),
            }),
            h(
              "span",
              { className: "mixapp-flowify-weight-val" },
              String(options.weights[id] || 0) + "%"
            ),
            options.method === "curves"
              ? h(
                  "button",
                  {
                    type: "button",
                    className:
                      "mixapp-btn mixapp-btn-ghost mixapp-btn-compact" +
                      (options.invert?.[id] ? " mixapp-btn-active" : ""),
                    title: MixAppI18n.t("flowify.invert"),
                    onClick: () => toggleInvert(id),
                  },
                  MixAppI18n.t("flowify.inv")
                )
              : null
          )
        )
      ),
      error ? h("div", { className: "mixapp-find-error" }, error) : null,
      h(
        "div",
        { className: "mixapp-flowify-actions" },
        h(
          "button",
          {
            type: "button",
            className: "mixapp-btn mixapp-btn-ghost",
            onClick: () => setOptions(MixAppFlowify.defaultOptions()),
            disabled: busy,
          },
          MixAppI18n.t("common.reset")
        ),
        h(
          "button",
          {
            type: "button",
            className: "mixapp-btn mixapp-btn-primary",
            onClick: handleApply,
            disabled: busy || count < 2 || !active.length,
          },
          busy ? MixAppI18n.t("flowify.working") : MixAppI18n.t("flowify.apply")
        )
      )
    )
  );
}
