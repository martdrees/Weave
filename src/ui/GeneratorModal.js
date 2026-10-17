//@ts-check

/**
 * Phase 6 — Generator: build a new playlist via the same recommend engine.
 * Does not alter the Recommendations panel; opens as its own modal.
 */
function MixAppGeneratorModal(props) {
  const react = Spicetify.React;
  const {
    open,
    playlist,
    tracks,
    seedUris,
    onClose,
    onCreated,
  } = props;

  const prefsGen = MixAppPrefs?.load?.()?.generator || {};
  const [name, setName] = react.useState("");
  const [limit, setLimit] = react.useState(() => prefsGen.limit || 40);
  const [features, setFeatures] = react.useState(() =>
    MixAppRecommend.defaultFeatureState()
  );
  const [excludeExplicit, setExcludeExplicit] = react.useState(
    () => !!prefsGen.excludeExplicit
  );
  const [excludeAberrant, setExcludeAberrant] = react.useState(
    () => prefsGen.excludeAberrant !== false
  );
  const [flowifyAfter, setFlowifyAfter] = react.useState(
    () => prefsGen.flowifyAfter !== false
  );
  const [busy, setBusy] = react.useState(false);
  const [error, setError] = react.useState(null);
  const [preview, setPreview] = react.useState([]);
  const genRef = react.useRef(0);

  react.useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape" && !busy) onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  react.useEffect(() => {
    if (open) {
      const base = playlist?.name || "MixApp";
      setName(base + " (generated)");
      setError(null);
      setPreview([]);
      setBusy(false);
    } else {
      genRef.current += 1;
      setBusy(false);
    }
  }, [open, playlist?.name]);

  if (!open) return null;

  const seedCount = (seedUris || []).length;
  const hasTracks = Array.isArray(tracks) && tracks.length > 0;
  const canRun = hasTracks || seedCount > 0;

  function updateFeature(id, patch) {
    setFeatures((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  async function runGenerate() {
    if (!canRun) {
      setError("Load a playlist or mark seed tracks first");
      return;
    }
    const gen = ++genRef.current;
    setBusy(true);
    setError(null);
    setPreview([]);
    try {
      const seedTrackIds = (seedUris || [])
        .map((uri) => MixAppRecommend.trackIdFromUri(uri))
        .filter(Boolean);
      const seedTracks = (tracks || []).filter((t) =>
        (seedUris || []).includes(t.uri)
      );

      const result = await MixAppRecommend.recommend({
        seedTrackIds,
        seedTracks,
        contextTracks: tracks || [],
        features,
        limit: Math.min(
          MixAppRecommend.MAX_LIMIT,
          Math.max(10, Number(limit) || 40)
        ),
        filters: {
          excludeExplicit: !!excludeExplicit,
          excludeAberrant: !!excludeAberrant,
          includeSeedTracks: false,
          hideExistingUris: (tracks || []).map((t) => t.uri).filter(Boolean),
          hideExistingTracks: tracks || [],
        },
      });

      if (gen !== genRef.current) return;

      let list = Array.isArray(result?.tracks) ? result.tracks.slice() : [];
      try {
        list = await MixAppFeatures.enrichTracks(list);
      } catch (err) {
        console.warn("MixApp generator enrich", err);
      }

      if (flowifyAfter && list.length > 2) {
        list = MixAppFlowify.arrange(list, {
          method: "sets",
          setSize: 4,
          weights: MixAppFlowify.defaultWeights(),
        });
      }

      if (gen !== genRef.current) return;
      try {
        MixAppPrefs?.patch?.({
          generator: {
            limit,
            flowifyAfter,
            excludeExplicit,
            excludeAberrant,
          },
        });
      } catch (_) {
        /* ignore */
      }
      setPreview(list);
      if (!list.length) {
        setError("No tracks generated — try wider feature ranges or seeds");
      }
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setError(err?.message || "Generate failed");
      setPreview([]);
    } finally {
      if (gen === genRef.current) setBusy(false);
    }
  }

  async function createFromPreview() {
    if (!preview.length) {
      setError("Generate tracks first");
      return;
    }
    const title = String(name || "").trim() || "MixApp generated";
    setBusy(true);
    setError(null);
    try {
      const uri = await MixAppApi.createPlaylist(
        title,
        preview.map((t) => t.uri).filter(Boolean)
      );
      MixAppApi.notify(`Created “${title}” (${preview.length} tracks)`);
      onCreated?.(uri);
      onClose?.();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Create playlist failed");
    } finally {
      setBusy(false);
    }
  }

  const defs = MixAppRecommend.FEATURE_DEFS.filter((d) =>
    ["energy", "danceability", "valence", "acousticness", "tempo"].includes(
      d.id
    )
  );

  return react.createElement(
    "div",
    {
      className: "mixapp-results-overlay",
      role: "presentation",
      onClick: (e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      },
    },
    react.createElement(
      "div",
      {
        className:
          "mixapp-results-modal mixapp-find-modal mixapp-generator-modal",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Generator",
      },
      react.createElement(
        "div",
        { className: "mixapp-recommend-header" },
        react.createElement(
          "div",
          { className: "mixapp-search-panel-title-row" },
          react.createElement("h2", null, "Generator"),
          preview.length
            ? react.createElement(
                "span",
                { className: "mixapp-recommend-meta" },
                preview.length + " ready"
              )
            : null
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "mixapp-icon-btn",
            onClick: onClose,
            disabled: busy,
            title: "Close",
            "aria-label": "Close",
          },
          "✕"
        )
      ),
      react.createElement(
        "div",
        { className: "mixapp-generator-body" },
        react.createElement(
          "p",
          { className: "mixapp-recommend-meta" },
          seedCount
            ? "Using " + seedCount + " marked seed track(s)."
            : "No seeds marked — soft-seeds from the current playlist."
        ),
        react.createElement(
          "label",
          { className: "mixapp-flowify-field" },
          react.createElement("span", null, "New playlist name"),
          react.createElement("input", {
            type: "text",
            className: "mixapp-find-input",
            value: name,
            onChange: (e) => setName(e.target.value),
            disabled: busy,
          })
        ),
        react.createElement(
          "label",
          { className: "mixapp-flowify-field" },
          react.createElement("span", null, "Track count"),
          react.createElement("input", {
            type: "number",
            className: "mixapp-find-input",
            min: 10,
            max: MixAppRecommend.MAX_LIMIT,
            value: limit,
            onChange: (e) =>
              setLimit(
                Math.max(
                  10,
                  Math.min(
                    MixAppRecommend.MAX_LIMIT,
                    parseInt(e.target.value, 10) || 40
                  )
                )
              ),
            disabled: busy,
          })
        ),
        react.createElement(
          "div",
          { className: "mixapp-generator-features" },
          react.createElement("h3", null, "Feature ranges (optional)"),
          defs.map((def) => {
            const range = features[def.id] || {};
            return react.createElement(
              "div",
              { key: def.id, className: "mixapp-flowify-weight-row" },
              react.createElement(
                "label",
                { className: "mixapp-flowify-weight-label" },
                react.createElement("input", {
                  type: "checkbox",
                  checked: !!range.enabled,
                  disabled: busy,
                  onChange: (e) =>
                    updateFeature(def.id, { enabled: e.target.checked }),
                }),
                " ",
                def.label
              ),
              react.createElement("input", {
                type: "range",
                min: def.min,
                max: def.max,
                step: def.step,
                disabled: busy || !range.enabled,
                value: Number(range.min),
                onChange: (e) => {
                  let minV = Number(e.target.value);
                  let maxV = Number(range.max);
                  if (minV > maxV) maxV = minV;
                  updateFeature(def.id, { min: minV, max: maxV });
                },
                title: "Min",
              }),
              react.createElement("input", {
                type: "range",
                min: def.min,
                max: def.max,
                step: def.step,
                disabled: busy || !range.enabled,
                value: Number(range.max),
                onChange: (e) => {
                  let maxV = Number(e.target.value);
                  let minV = Number(range.min);
                  if (maxV < minV) minV = maxV;
                  updateFeature(def.id, { min: minV, max: maxV });
                },
                title: "Max",
              })
            );
          })
        ),
        react.createElement(
          "div",
          { className: "mixapp-generator-checks" },
          react.createElement(
            "label",
            null,
            react.createElement("input", {
              type: "checkbox",
              checked: excludeExplicit,
              disabled: busy,
              onChange: (e) => setExcludeExplicit(e.target.checked),
            }),
            " Exclude explicit"
          ),
          react.createElement(
            "label",
            null,
            react.createElement("input", {
              type: "checkbox",
              checked: excludeAberrant,
              disabled: busy,
              onChange: (e) => setExcludeAberrant(e.target.checked),
            }),
            " Exclude aberrant titles"
          ),
          react.createElement(
            "label",
            null,
            react.createElement("input", {
              type: "checkbox",
              checked: flowifyAfter,
              disabled: busy,
              onChange: (e) => setFlowifyAfter(e.target.checked),
            }),
            " Flowify sets after generate"
          )
        ),
        error
          ? react.createElement("div", { className: "mixapp-find-error" }, error)
          : null,
        preview.length
          ? react.createElement(
              "div",
              { className: "mixapp-generator-preview" },
              react.createElement("h3", null, "Preview"),
              react.createElement(
                "ul",
                { className: "mixapp-generator-preview-list" },
                preview.slice(0, 12).map((t, i) =>
                  react.createElement(
                    "li",
                    { key: t.uri || i },
                    (t.name || "Unknown") +
                      (t.artists ? " — " + t.artists : "")
                  )
                ),
                preview.length > 12
                  ? react.createElement(
                      "li",
                      { className: "mixapp-recommend-meta" },
                      "…and " + (preview.length - 12) + " more"
                    )
                  : null
              )
            )
          : null,
        react.createElement(
          "div",
          { className: "mixapp-flowify-actions" },
          react.createElement(
            "button",
            {
              type: "button",
              className: "mixapp-btn",
              onClick: runGenerate,
              disabled: busy || !canRun,
            },
            busy && !preview.length ? "Generating…" : "Generate"
          ),
          react.createElement(
            "button",
            {
              type: "button",
              className: "mixapp-btn mixapp-btn-primary",
              onClick: createFromPreview,
              disabled: busy || !preview.length,
            },
            busy && preview.length ? "Creating…" : "Create playlist"
          )
        )
      )
    )
  );
}
