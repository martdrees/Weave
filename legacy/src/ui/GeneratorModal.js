//@ts-check

/**
 * Phase 6 — Generator: build a new playlist via the same recommend engine.
 * Does not alter the Recommendations panel; opens as its own modal.
 */
function WeaveGeneratorModal(props) {
  const react = Spicetify.React;
  const {
    open,
    playlist,
    tracks,
    seedUris,
    playingUri,
    isPlaying,
    onClose,
    onCreated,
    onPlay,
  } = props;

  const prefsGen = WeavePrefs?.load?.()?.generator || {};
  const [name, setName] = react.useState("");
  const [limit, setLimit] = react.useState(() => prefsGen.limit || 40);
  const [features, setFeatures] = react.useState(() =>
    WeaveRecommend.defaultFeatureState()
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
    if (open) {
      setName(
        playlist?.name
          ? WeaveI18n.t("playlist.weaveSuffix", { name: playlist.name })
          : WeaveI18n.t("generator.defaultName")
      );
      setError(null);
      setPreview([]);
      setBusy(false);
    } else {
      genRef.current += 1;
      setBusy(false);
    }
  }, [open, playlist?.name]);

  const seedCount = (seedUris || []).length;
  const hasTracks = Array.isArray(tracks) && tracks.length > 0;
  const canRun = hasTracks || seedCount > 0;

  async function runGenerate() {
    if (!canRun) {
      setError(WeaveI18n.t("notify.needSeedsOrPlaylist"));
      return;
    }
    const gen = ++genRef.current;
    setBusy(true);
    setError(null);
    setPreview([]);
    try {
      const seedTrackIds = (seedUris || [])
        .map((uri) => WeaveRecommend.trackIdFromUri(uri))
        .filter(Boolean);
      const seedTracks = (tracks || []).filter((t) => (seedUris || []).includes(t.uri));

      const result = await WeaveRecommend.recommend({
        seedTrackIds,
        seedTracks,
        contextTracks: tracks || [],
        features,
        limit: Math.min(WeaveRecommend.MAX_LIMIT, Math.max(10, Number(limit) || 40)),
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
        list = await WeaveFeatures.enrichTracks(list);
      } catch (err) {
        console.warn("Weave generator enrich", err);
      }

      if (flowifyAfter && list.length > 2) {
        list = WeaveFlowify.arrange(list, {
          method: "sets",
          setSize: 4,
          weights: WeaveFlowify.defaultWeights(),
        });
      }

      if (gen !== genRef.current) return;
      try {
        WeavePrefs?.patch?.({
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
        setError(WeaveI18n.t("notify.noMatches"));
      }
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setError(err?.message || WeaveI18n.t("notify.searchFailed"));
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
    const title = String(name || "").trim() || WeaveI18n.t("generator.defaultName");
    setBusy(true);
    setError(null);
    try {
      const uri = await WeaveApi.createPlaylist(
        title,
        preview.map((t) => t.uri).filter(Boolean)
      );
      WeaveApi.notify(
        WeaveI18n.t("notify.generatorCreated", {
          name: title,
          count: preview.length,
        })
      );
      onCreated?.(uri);
      onClose?.();
    } catch (err) {
      console.error(err);
      setError(err?.message || WeaveI18n.t("notify.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  return h(
    WeaveModal,
    {
      open,
      title: WeaveI18n.t("generator.title"),
      meta: preview.length
        ? WeaveI18n.t("picker.tracks", { count: preview.length })
        : null,
      onClose,
      ariaLabel: WeaveI18n.t("generator.title"),
      className: "weave-find-modal weave-generator-modal",
      closeDisabled: busy,
    },
    h(
      "div",
      { className: "weave-generator-body" },
      h(
        "div",
        { className: "weave-generator-settings" },
        h(
          "p",
          { className: "weave-recommend-meta" },
          seedCount
            ? WeaveI18n.t(seedCount === 1 ? "toolbar.seed" : "toolbar.seeds", {
                count: seedCount,
              })
            : "No seeds marked — soft-seeds from the current playlist."
        ),
        h(
          "div",
          { className: "weave-generator-fields" },
          h(
            "label",
            { className: "weave-flowify-field" },
            h("span", null, WeaveI18n.t("generator.name")),
            h("input", {
              type: "text",
              className: "weave-find-input",
              value: name,
              onChange: (e) => setName(e.target.value),
              disabled: busy,
            })
          ),
          h(
            "label",
            { className: "weave-flowify-field weave-generator-limit" },
            h("span", null, WeaveI18n.t("generator.size")),
            h("input", {
              type: "number",
              className: "weave-find-input",
              min: 10,
              max: WeaveRecommend.MAX_LIMIT,
              value: limit,
              onChange: (e) =>
                setLimit(
                  Math.max(
                    10,
                    Math.min(
                      WeaveRecommend.MAX_LIMIT,
                      parseInt(e.target.value, 10) || 40
                    )
                  )
                ),
              disabled: busy,
            })
          )
        ),
        h(
          "div",
          { className: "weave-generator-features" },
          h("h3", null, WeaveI18n.t("search.featureRanges")),
          h(WeaveFeatureSliders, {
            features,
            onChange: setFeatures,
            disabled: busy,
            seedTracks: seedCount
              ? (tracks || []).filter((t) => (seedUris || []).includes(t.uri))
              : tracks || [],
          })
        ),
        h(
          "div",
          { className: "weave-generator-checks" },
          h(
            "label",
            null,
            h("input", {
              type: "checkbox",
              checked: excludeExplicit,
              disabled: busy,
              onChange: (e) => setExcludeExplicit(e.target.checked),
            }),
            " " + WeaveI18n.t("generator.excludeExplicit")
          ),
          h(
            "label",
            null,
            h("input", {
              type: "checkbox",
              checked: excludeAberrant,
              disabled: busy,
              onChange: (e) => setExcludeAberrant(e.target.checked),
            }),
            " " + WeaveI18n.t("generator.excludeAberrant")
          ),
          h(
            "label",
            null,
            h("input", {
              type: "checkbox",
              checked: flowifyAfter,
              disabled: busy,
              onChange: (e) => setFlowifyAfter(e.target.checked),
            }),
            " " + WeaveI18n.t("generator.flowifyAfter")
          )
        ),
        error
          ? h("div", { className: "weave-find-error weave-generator-error" }, error)
          : null,
        h(
          "div",
          { className: "weave-flowify-actions" },
          h(
            "button",
            {
              type: "button",
              className: "weave-btn",
              onClick: runGenerate,
              disabled: busy || !canRun,
            },
            busy && !preview.length
              ? WeaveI18n.t("generator.generating")
              : WeaveI18n.t("generator.generate")
          ),
          h(
            "button",
            {
              type: "button",
              className: "weave-btn weave-btn-primary",
              onClick: createFromPreview,
              disabled: busy || !preview.length,
            },
            busy && preview.length
              ? WeaveI18n.t("generator.creating")
              : WeaveI18n.t("generator.create")
          )
        )
      ),
      h(
        "div",
        { className: "weave-generator-preview" },
        h(
          "div",
          { className: "weave-generator-preview-head" },
          h("h3", null, WeaveI18n.t("generator.preview")),
          preview.length
            ? h(
                "span",
                { className: "weave-recommend-meta" },
                "Play to audition before creating"
              )
            : null
        ),
        h(
          "div",
          { className: "weave-search-results-body" },
          h(WeaveTrackTable, {
            tracks: preview,
            playingUri,
            isPlaying,
            onPlay,
            loading: busy && !preview.length,
            loadingLabel: WeaveI18n.t("generator.generating"),
            emptyLabel: error
              ? error
              : canRun
                ? "Press Generate to preview tracks here."
                : WeaveI18n.t("notify.needSeedsOrPlaylist"),
          })
        )
      )
    )
  );
}
