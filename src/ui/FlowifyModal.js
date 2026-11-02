//@ts-check

/** Flowify: live preview rearrange by curves/sets, then Apply or Save as new. */
function WeaveFlowifyModal(props) {
  const react = Spicetify.React;
  const { open, tracks, onClose, onApply, onSaveAsNew, playingUri, isPlaying, onPlay } =
    props;

  const [options, setOptions] = react.useState(() => {
    const saved = WeavePrefs?.load?.()?.flowify;
    return saved
      ? { ...WeaveFlowify.defaultOptions(), ...saved }
      : WeaveFlowify.defaultOptions();
  });
  const [enriching, setEnriching] = react.useState(false);
  const [committing, setCommitting] = react.useState(false);
  const [error, setError] = react.useState(null);
  /** @type {[WeaveTrackRow[]|null, Function]} */
  const [enriched, setEnriched] = react.useState(null);
  /** @type {[WeaveTrackRow[]|null, Function]} */
  const [preview, setPreview] = react.useState(null);

  const count = Array.isArray(tracks) ? tracks.length : 0;
  const active = WeaveFlowify.activeWeights(options.weights);
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
      setError(WeaveI18n.t("flowify.needPlaylist"));
      return undefined;
    }
    let cancelled = false;
    setEnriching(true);
    setError(null);
    (async () => {
      let list = (tracks || []).map((t) => (t && typeof t === "object" ? { ...t } : t));
      try {
        try {
          list = await WeaveFeatures.enrichTracks(list);
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
      setError(WeaveI18n.t("flowify.needWeight"));
      return undefined;
    }
    const timer = setTimeout(() => {
      try {
        const next = WeaveFlowify.arrange(enriched, options);
        setPreview(next);
        setError(null);
        try {
          WeavePrefs?.patch?.({ flowify: options });
        } catch (_) {
          /* ignore */
        }
      } catch (err) {
        console.error(err);
        setError(err?.message || WeaveI18n.t("flowify.failed"));
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
    setOptions(WeaveFlowify.defaultOptions());
  }

  async function handleApply() {
    if (!previewCount || committing) {
      setError(WeaveI18n.t("flowify.needPreview"));
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
      setError(err?.message || WeaveI18n.t("flowify.failed"));
    } finally {
      setCommitting(false);
    }
  }

  async function handleSaveAsNew() {
    if (!previewCount || committing) {
      setError(WeaveI18n.t("flowify.needPreview"));
      return;
    }
    setCommitting(true);
    setError(null);
    try {
      const ok = await onSaveAsNew?.(preview);
      if (ok !== false) onClose?.();
    } catch (err) {
      console.error(err);
      setError(err?.message || WeaveI18n.t("flowify.failed"));
    } finally {
      setCommitting(false);
    }
  }

  return h(
    WeaveModal,
    {
      open,
      title: WeaveI18n.t("flowify.title"),
      meta: WeaveI18n.t("picker.tracks", { count }),
      onClose,
      ariaLabel: WeaveI18n.t("flowify.title"),
      className: "weave-find-modal weave-flowify-modal",
      closeDisabled: busy,
    },
    h(
      "div",
      { className: "weave-flowify-body" },
      h(
        "div",
        { className: "weave-flowify-settings" },
        h("p", { className: "weave-recommend-meta" }, WeaveI18n.t("flowify.blurb")),
        h(
          "div",
          { className: "weave-copy-tabs" },
          h(
            "button",
            {
              type: "button",
              className:
                "weave-btn weave-btn-ghost" +
                (options.method === "sets" ? " weave-btn-active" : ""),
              onClick: () => patch({ method: "sets" }),
              disabled: busy,
            },
            WeaveI18n.t("flowify.sets")
          ),
          h(
            "button",
            {
              type: "button",
              className:
                "weave-btn weave-btn-ghost" +
                (options.method === "curves" ? " weave-btn-active" : ""),
              onClick: () => patch({ method: "curves" }),
              disabled: busy,
            },
            WeaveI18n.t("flowify.curves")
          )
        ),
        options.method === "sets"
          ? h(
              "label",
              { className: "weave-flowify-field" },
              h("span", null, WeaveI18n.t("flowify.setSize")),
              h("input", {
                type: "number",
                className: "weave-find-input",
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
              { className: "weave-flowify-field" },
              h("span", null, WeaveI18n.t("flowify.curveShape")),
              h(
                "select",
                {
                  className: "weave-select weave-find-input",
                  value: options.curvePreset,
                  disabled: busy,
                  onChange: (e) => patch({ curvePreset: e.target.value }),
                },
                WeaveFlowify.CURVE_PRESETS.map((p) =>
                  h("option", { key: p.id, value: p.id }, p.label)
                )
              )
            ),
        h(
          "div",
          { className: "weave-flowify-weights" },
          h("h3", null, WeaveI18n.t("flowify.weights")),
          WeaveFlowify.FEATURE_IDS.map((id) =>
            h(
              "div",
              { key: id, className: "weave-flowify-weight-row" },
              h(
                "span",
                { className: "weave-flowify-weight-label" },
                WeaveI18n.featureLabel(id)
              ),
              h("input", {
                type: "range",
                min: 0,
                max: 100,
                step: 5,
                value: options.weights[id] || 0,
                disabled: busy,
                onChange: (e) => setWeight(id, e.target.value),
                "aria-label": WeaveI18n.featureLabel(id),
              }),
              h(
                "span",
                { className: "weave-flowify-weight-val" },
                String(options.weights[id] || 0) + "%"
              ),
              options.method === "curves"
                ? h(
                    "button",
                    {
                      type: "button",
                      className:
                        "weave-btn weave-btn-ghost weave-btn-compact" +
                        (options.invert?.[id] ? " weave-btn-active" : ""),
                      title: WeaveI18n.t("flowify.invert"),
                      disabled: busy,
                      onClick: () => toggleInvert(id),
                    },
                    WeaveI18n.t("flowify.inv")
                  )
                : null
            )
          )
        ),
        error ? h("div", { className: "weave-find-error" }, error) : null,
        h(
          "div",
          { className: "weave-flowify-actions" },
          h(
            "button",
            {
              type: "button",
              className: "weave-btn weave-btn-ghost",
              onClick: resetOptions,
              disabled: busy,
            },
            WeaveI18n.t("common.reset")
          ),
          h(
            "button",
            {
              type: "button",
              className: "weave-btn weave-btn-ghost",
              onClick: handleSaveAsNew,
              disabled: busy || !previewCount,
              title: WeaveI18n.t("flowify.saveAsNewTitle"),
            },
            committing
              ? WeaveI18n.t("toolbar.saving")
              : WeaveI18n.t("toolbar.saveAsNew")
          ),
          h(
            "button",
            {
              type: "button",
              className: "weave-btn weave-btn-primary",
              onClick: handleApply,
              disabled: busy || !previewCount,
              title: WeaveI18n.t("flowify.applyTitle"),
            },
            committing ? WeaveI18n.t("flowify.working") : WeaveI18n.t("flowify.apply")
          )
        )
      ),
      h(
        "div",
        { className: "weave-flowify-preview" },
        h(
          "div",
          { className: "weave-flowify-preview-head" },
          h("h3", null, WeaveI18n.t("flowify.preview")),
          previewCount
            ? h(
                "span",
                { className: "weave-recommend-meta" },
                WeaveI18n.t("picker.tracks", { count: previewCount })
              )
            : null
        ),
        h(
          "div",
          { className: "weave-search-results-body" },
          h(WeaveTrackTable, {
            tracks: preview || [],
            playingUri,
            isPlaying,
            onPlay,
            loading: enriching && !previewCount,
            loadingLabel: WeaveI18n.t("flowify.working"),
            emptyLabel: error || WeaveI18n.t("flowify.previewHint"),
          })
        )
      )
    )
  );
}
