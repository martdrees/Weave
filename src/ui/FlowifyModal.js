//@ts-check

/** Flowify: live preview rearrange by curves/sets, then Apply or Save as new. */
function MixAppFlowifyModal(props) {
  const react = Spicetify.React;
  const { open, tracks, onClose, onApply, onSaveAsNew, playingUri, isPlaying, onPlay } =
    props;

  const [options, setOptions] = react.useState(() => {
    const saved = MixAppPrefs?.load?.()?.flowify;
    return saved
      ? { ...MixAppFlowify.defaultOptions(), ...saved }
      : MixAppFlowify.defaultOptions();
  });
  const [enriching, setEnriching] = react.useState(false);
  const [committing, setCommitting] = react.useState(false);
  const [error, setError] = react.useState(null);
  /** @type {[MixAppTrackRow[]|null, Function]} */
  const [enriched, setEnriched] = react.useState(null);
  /** @type {[MixAppTrackRow[]|null, Function]} */
  const [preview, setPreview] = react.useState(null);

  const count = Array.isArray(tracks) ? tracks.length : 0;
  const active = MixAppFlowify.activeWeights(options.weights);
  const previewCount = Array.isArray(preview) ? preview.length : 0;
  const busy = enriching || committing;
  const tracksKey = react.useMemo(
    () =>
      Array.isArray(tracks)
        ? tracks.map((t) => String(t?.uid || t?.uri || "")).join("\0")
        : "",
    [tracks]
  );

  react.useEffect(() => {
    if (!open) {
      setEnriching(false);
      setCommitting(false);
      setError(null);
      setEnriched(null);
      setPreview(null);
    }
  }, [open]);

  // Enrich a clone when the modal opens or source tracks change (local only).
  // Skip while committing — Apply may change session tracks underneath the modal.
  react.useEffect(() => {
    if (!open || committing) return undefined;
    if (!count) {
      setEnriched(null);
      setPreview(null);
      setError(MixAppI18n.t("flowify.needPlaylist"));
      return undefined;
    }
    let cancelled = false;
    setEnriching(true);
    setError(null);
    (async () => {
      let list = (tracks || []).map((t) => (t && typeof t === "object" ? { ...t } : t));
      try {
        try {
          list = await MixAppFeatures.enrichTracks(list);
        } catch (err) {
          console.warn("Weave Flowify enrich", err);
        }
        if (!cancelled) setEnriched(list);
      } finally {
        if (!cancelled) setEnriching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tracksKey, count, committing]);

  // Live arrange into preview whenever options or enriched rows change.
  react.useEffect(() => {
    if (!open || committing) return undefined;
    if (!enriched || !enriched.length) {
      setPreview(null);
      return undefined;
    }
    if (!active.length) {
      setPreview(null);
      setError(MixAppI18n.t("flowify.needWeight"));
      return undefined;
    }
    const timer = setTimeout(() => {
      try {
        const next = MixAppFlowify.arrange(enriched, options);
        setPreview(next);
        setError(null);
        try {
          MixAppPrefs?.patch?.({ flowify: options });
        } catch (_) {
          /* ignore */
        }
      } catch (err) {
        console.error(err);
        setError(err?.message || MixAppI18n.t("flowify.failed"));
        setPreview(null);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [open, enriched, options, active.length, committing]);

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

  function resetOptions() {
    setOptions(MixAppFlowify.defaultOptions());
  }

  async function handleApply() {
    if (!previewCount || committing) {
      setError(MixAppI18n.t("flowify.needPreview"));
      return;
    }
    setCommitting(true);
    setError(null);
    try {
      // Stay open until the session write finishes so a second Apply cannot race.
      const ok = await onApply?.(preview);
      if (ok !== false) onClose?.();
    } catch (err) {
      console.error(err);
      setError(err?.message || MixAppI18n.t("flowify.failed"));
    } finally {
      setCommitting(false);
    }
  }

  async function handleSaveAsNew() {
    if (!previewCount || committing) {
      setError(MixAppI18n.t("flowify.needPreview"));
      return;
    }
    setCommitting(true);
    setError(null);
    try {
      const ok = await onSaveAsNew?.(preview);
      if (ok !== false) onClose?.();
    } catch (err) {
      console.error(err);
      setError(err?.message || MixAppI18n.t("flowify.failed"));
    } finally {
      setCommitting(false);
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
        "div",
        { className: "mixapp-flowify-settings" },
        h("p", { className: "mixapp-recommend-meta" }, MixAppI18n.t("flowify.blurb")),
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
              disabled: busy,
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
              disabled: busy,
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
                disabled: busy,
                onChange: (e) =>
                  patch({
                    setSize: Math.max(
                      2,
                      Math.min(20, parseInt(e.target.value, 10) || 4)
                    ),
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
                  disabled: busy,
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
                disabled: busy,
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
                      disabled: busy,
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
              onClick: resetOptions,
              disabled: busy,
            },
            MixAppI18n.t("common.reset")
          ),
          h(
            "button",
            {
              type: "button",
              className: "mixapp-btn mixapp-btn-ghost",
              onClick: handleSaveAsNew,
              disabled: busy || !previewCount,
              title: MixAppI18n.t("flowify.saveAsNewTitle"),
            },
            committing
              ? MixAppI18n.t("toolbar.saving")
              : MixAppI18n.t("toolbar.saveAsNew")
          ),
          h(
            "button",
            {
              type: "button",
              className: "mixapp-btn mixapp-btn-primary",
              onClick: handleApply,
              disabled: busy || !previewCount,
              title: MixAppI18n.t("flowify.applyTitle"),
            },
            committing ? MixAppI18n.t("flowify.working") : MixAppI18n.t("flowify.apply")
          )
        )
      ),
      h(
        "div",
        { className: "mixapp-flowify-preview" },
        h(
          "div",
          { className: "mixapp-flowify-preview-head" },
          h("h3", null, MixAppI18n.t("flowify.preview")),
          previewCount
            ? h(
                "span",
                { className: "mixapp-recommend-meta" },
                MixAppI18n.t("picker.tracks", { count: previewCount })
              )
            : null
        ),
        h(
          "div",
          { className: "mixapp-search-results-body" },
          h(MixAppTrackTable, {
            tracks: preview || [],
            playingUri,
            isPlaying,
            onPlay,
            loading: enriching && !previewCount,
            loadingLabel: MixAppI18n.t("flowify.working"),
            emptyLabel: error || MixAppI18n.t("flowify.previewHint"),
          })
        )
      )
    )
  );
}
