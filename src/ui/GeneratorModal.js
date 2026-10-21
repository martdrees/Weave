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
    playingUri,
    isPlaying,
    onClose,
    onCreated,
    onPlay,
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
    if (open) {
      setName(
        playlist?.name
          ? MixAppI18n.t("playlist.weaveSuffix", { name: playlist.name })
          : MixAppI18n.t("generator.defaultName")
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
      setError(MixAppI18n.t("notify.needSeedsOrPlaylist"));
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
      const seedTracks = (tracks || []).filter((t) => (seedUris || []).includes(t.uri));

      const result = await MixAppRecommend.recommend({
        seedTrackIds,
        seedTracks,
        contextTracks: tracks || [],
        features,
        limit: Math.min(MixAppRecommend.MAX_LIMIT, Math.max(10, Number(limit) || 40)),
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
        console.warn("Weave generator enrich", err);
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
        setError(MixAppI18n.t("notify.noMatches"));
      }
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setError(err?.message || MixAppI18n.t("notify.searchFailed"));
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
    const title =
      String(name || "").trim() || MixAppI18n.t("generator.defaultName");
    setBusy(true);
    setError(null);
    try {
      const uri = await MixAppApi.createPlaylist(
        title,
        preview.map((t) => t.uri).filter(Boolean)
      );
      MixAppApi.notify(
        MixAppI18n.t("notify.generatorCreated", {
          name: title,
          count: preview.length,
        })
      );
      onCreated?.(uri);
      onClose?.();
    } catch (err) {
      console.error(err);
      setError(err?.message || MixAppI18n.t("notify.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  return h(
    MixAppModal,
    {
      open,
      title: MixAppI18n.t("generator.title"),
      meta: preview.length
        ? MixAppI18n.t("picker.tracks", { count: preview.length })
        : null,
      onClose,
      ariaLabel: MixAppI18n.t("generator.title"),
      className: "mixapp-find-modal mixapp-generator-modal",
      closeDisabled: busy,
    },
    h(
      "div",
      { className: "mixapp-generator-body" },
      h(
        "div",
        { className: "mixapp-generator-settings" },
        h(
          "p",
          { className: "mixapp-recommend-meta" },
          seedCount
            ? MixAppI18n.t(seedCount === 1 ? "toolbar.seed" : "toolbar.seeds", {
                count: seedCount,
              })
            : "No seeds marked — soft-seeds from the current playlist."
        ),
        h(
          "div",
          { className: "mixapp-generator-fields" },
          h(
            "label",
            { className: "mixapp-flowify-field" },
            h("span", null, MixAppI18n.t("generator.name")),
            h("input", {
              type: "text",
              className: "mixapp-find-input",
              value: name,
              onChange: (e) => setName(e.target.value),
              disabled: busy,
            })
          ),
          h(
            "label",
            { className: "mixapp-flowify-field mixapp-generator-limit" },
            h("span", null, MixAppI18n.t("generator.size")),
            h("input", {
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
          )
        ),
        h(
          "div",
          { className: "mixapp-generator-features" },
          h("h3", null, MixAppI18n.t("search.featureRanges")),
          h(MixAppFeatureSliders, {
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
          { className: "mixapp-generator-checks" },
          h(
            "label",
            null,
            h("input", {
              type: "checkbox",
              checked: excludeExplicit,
              disabled: busy,
              onChange: (e) => setExcludeExplicit(e.target.checked),
            }),
            " " + MixAppI18n.t("generator.excludeExplicit")
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
            " " + MixAppI18n.t("generator.excludeAberrant")
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
            " " + MixAppI18n.t("generator.flowifyAfter")
          )
        ),
        error
          ? h("div", { className: "mixapp-find-error mixapp-generator-error" }, error)
          : null,
        h(
          "div",
          { className: "mixapp-flowify-actions" },
          h(
            "button",
            {
              type: "button",
              className: "mixapp-btn",
              onClick: runGenerate,
              disabled: busy || !canRun,
            },
            busy && !preview.length
              ? MixAppI18n.t("generator.generating")
              : MixAppI18n.t("generator.generate")
          ),
          h(
            "button",
            {
              type: "button",
              className: "mixapp-btn mixapp-btn-primary",
              onClick: createFromPreview,
              disabled: busy || !preview.length,
            },
            busy && preview.length
              ? MixAppI18n.t("generator.creating")
              : MixAppI18n.t("generator.create")
          )
        )
      ),
      h(
        "div",
        { className: "mixapp-generator-preview" },
        h(
          "div",
          { className: "mixapp-generator-preview-head" },
          h("h3", null, MixAppI18n.t("generator.preview")),
          preview.length
            ? h(
                "span",
                { className: "mixapp-recommend-meta" },
                "Play to audition before creating"
              )
            : null
        ),
        h(
          "div",
          { className: "mixapp-search-results-body" },
          h(MixAppTrackTable, {
            tracks: preview,
            playingUri,
            isPlaying,
            onPlay,
            loading: busy && !preview.length,
            loadingLabel: MixAppI18n.t("generator.generating"),
            emptyLabel: error
              ? error
              : canRun
                ? "Press Generate to preview tracks here."
                : MixAppI18n.t("notify.needSeedsOrPlaylist"),
          })
        )
      )
    )
  );
}
