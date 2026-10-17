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
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  react.useEffect(() => {
    if (!open) {
      setBusy(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

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
      setError("Load a playlist with tracks first");
      return;
    }
    if (!active.length) {
      setError("Set at least one feature weight above 0");
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
        console.warn("MixApp Flowify enrich", err);
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
          ? "Playlist rearranged (curves)"
          : "Playlist rearranged (sets)"
      );
      onClose?.();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Flowify failed");
    } finally {
      setBusy(false);
    }
  }

  return react.createElement(
    "div",
    {
      className: "mixapp-results-overlay",
      role: "presentation",
      onClick: (e) => {
        if (e.target === e.currentTarget) onClose?.();
      },
    },
    react.createElement(
      "div",
      {
        className: "mixapp-results-modal mixapp-find-modal mixapp-flowify-modal",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Flowify",
      },
      react.createElement(
        "div",
        { className: "mixapp-recommend-header" },
        react.createElement(
          "div",
          { className: "mixapp-search-panel-title-row" },
          react.createElement("h2", null, "Flowify"),
          react.createElement(
            "span",
            { className: "mixapp-recommend-meta" },
            count + " track" + (count === 1 ? "" : "s")
          )
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "mixapp-icon-btn",
            onClick: onClose,
            title: "Close",
            "aria-label": "Close",
          },
          "✕"
        )
      ),
      react.createElement(
        "div",
        { className: "mixapp-flowify-body" },
        react.createElement(
          "p",
          { className: "mixapp-recommend-meta" },
          "Auto-arrange the current playlist. Undo restores the previous order."
        ),
        react.createElement(
          "div",
          { className: "mixapp-copy-tabs" },
          react.createElement(
            "button",
            {
              type: "button",
              className:
                "mixapp-btn mixapp-btn-ghost" +
                (options.method === "sets" ? " mixapp-btn-active" : ""),
              onClick: () => patch({ method: "sets" }),
            },
            "Sets"
          ),
          react.createElement(
            "button",
            {
              type: "button",
              className:
                "mixapp-btn mixapp-btn-ghost" +
                (options.method === "curves" ? " mixapp-btn-active" : ""),
              onClick: () => patch({ method: "curves" }),
            },
            "Curves"
          )
        ),
        options.method === "sets"
          ? react.createElement(
              "label",
              { className: "mixapp-flowify-field" },
              react.createElement("span", null, "Set size"),
              react.createElement("input", {
                type: "number",
                className: "mixapp-find-input",
                min: 2,
                max: 20,
                value: options.setSize,
                onChange: (e) =>
                  patch({
                    setSize: Math.max(
                      2,
                      Math.min(20, parseInt(e.target.value, 10) || 4)
                    ),
                  }),
              })
            )
          : react.createElement(
              "label",
              { className: "mixapp-flowify-field" },
              react.createElement("span", null, "Curve shape"),
              react.createElement(
                "select",
                {
                  className: "mixapp-find-input",
                  value: options.curvePreset,
                  onChange: (e) => patch({ curvePreset: e.target.value }),
                },
                MixAppFlowify.CURVE_PRESETS.map((p) =>
                  react.createElement(
                    "option",
                    { key: p.id, value: p.id },
                    p.label
                  )
                )
              )
            ),
        react.createElement(
          "div",
          { className: "mixapp-flowify-weights" },
          react.createElement("h3", null, "Feature weights"),
          MixAppFlowify.FEATURE_IDS.map((id) =>
            react.createElement(
              "div",
              { key: id, className: "mixapp-flowify-weight-row" },
              react.createElement(
                "span",
                { className: "mixapp-flowify-weight-label" },
                MixAppFlowify.featureLabel(id)
              ),
              react.createElement("input", {
                type: "range",
                min: 0,
                max: 100,
                step: 5,
                value: options.weights[id] || 0,
                onChange: (e) => setWeight(id, e.target.value),
                "aria-label": MixAppFlowify.featureLabel(id) + " weight",
              }),
              react.createElement(
                "span",
                { className: "mixapp-flowify-weight-val" },
                String(options.weights[id] || 0) + "%"
              ),
              options.method === "curves"
                ? react.createElement(
                    "button",
                    {
                      type: "button",
                      className:
                        "mixapp-btn mixapp-btn-ghost mixapp-btn-compact" +
                        (options.invert?.[id] ? " mixapp-btn-active" : ""),
                      title: "Invert this feature’s curve",
                      onClick: () => toggleInvert(id),
                    },
                    "Inv"
                  )
                : null
            )
          )
        ),
        error
          ? react.createElement("div", { className: "mixapp-find-error" }, error)
          : null,
        react.createElement(
          "div",
          { className: "mixapp-flowify-actions" },
          react.createElement(
            "button",
            {
              type: "button",
              className: "mixapp-btn mixapp-btn-ghost",
              onClick: () => setOptions(MixAppFlowify.defaultOptions()),
              disabled: busy,
            },
            "Reset"
          ),
          react.createElement(
            "button",
            {
              type: "button",
              className: "mixapp-btn mixapp-btn-primary",
              onClick: handleApply,
              disabled: busy || count < 2 || !active.length,
            },
            busy ? "Working…" : "Apply arrangement"
          )
        )
      )
    )
  );
}
