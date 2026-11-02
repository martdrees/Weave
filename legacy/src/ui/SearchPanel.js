//@ts-check

/** Full-width search / filter bar (between toolbar and playlist table). */
function WeaveSearchPanel(props) {
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

  const seedCount = (seedUris || []).length;
  const hasPlaylistTracks = Array.isArray(tracks) && tracks.length > 0;
  const canSearch = seedCount > 0 || hasPlaylistTracks;
  const CAMELOT_KEYS = {
    same: ["camelot.harmonic", "camelot.harmonicHint"],
    plus1: ["camelot.moreEnergy", "camelot.moreEnergyHint"],
    minus1: ["camelot.lessEnergy", "camelot.lessEnergyHint"],
    brighter: ["camelot.brighter", "camelot.brighterHint"],
    darker: ["camelot.darker", "camelot.darkerHint"],
    plus2: ["camelot.boost", "camelot.boostHint"],
    diagonal: ["camelot.moodShift", "camelot.moodShiftHint"],
    jaws: ["camelot.harmonicShift", "camelot.harmonicShiftHint"],
  };
  const moveLabel = (move) =>
    CAMELOT_KEYS[move.id] ? WeaveI18n.t(CAMELOT_KEYS[move.id][0]) : move.label;
  const moveHint = (move) =>
    CAMELOT_KEYS[move.id] ? WeaveI18n.t(CAMELOT_KEYS[move.id][1]) : move.hint;

  const seedNames = (tracks || [])
    .filter((t) => seedUris?.includes(t.uri))
    .map((t) => t.name)
    .slice(0, 8);

  return h(
    "section",
    {
      className: "weave-search-panel",
      "aria-label": WeaveI18n.t("search.filters"),
    },
    h(
      "div",
      { className: "weave-search-panel-header" },
      h(
        "div",
        { className: "weave-search-panel-title-row" },
        h("h2", null, WeaveI18n.t("search.title")),
        h(
          "span",
          { className: "weave-recommend-meta" },
          seedCount
            ? WeaveI18n.t(seedCount === 1 ? "toolbar.seed" : "toolbar.seeds", {
                count: seedCount,
              }) +
                (seedNames.length
                  ? ": " + seedNames.join(", ") + (seedCount > 8 ? "…" : "")
                  : "")
            : hasPlaylistTracks
              ? "No seeds — searching from this playlist"
              : WeaveI18n.t("search.seedsNeeded")
        )
      ),
      h(
        "div",
        { className: "weave-search-panel-header-actions" },
        h(
          "button",
          {
            type: "button",
            className: "weave-btn weave-btn-ghost",
            onClick: onFitToSeeds,
            disabled: !seedCount || fitting,
            title: WeaveI18n.t("search.fitTitle"),
          },
          fitting ? WeaveI18n.t("search.fitting") : WeaveI18n.t("search.fitToSeeds")
        ),
        h(
          "button",
          {
            type: "button",
            className: "weave-btn weave-btn-ghost",
            onClick: onResetFeatures,
          },
          WeaveI18n.t("search.resetRanges")
        ),
        h(
          "label",
          { className: "weave-result-limit" },
          WeaveI18n.t("search.maxResults"),
          h(
            "select",
            {
              className: "weave-select weave-select-compact",
              value: resultLimit || WeaveRecommend.DEFAULT_LIMIT,
              onChange: (e) => onResultLimitChange?.(Number(e.target.value)),
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
            className: "weave-btn weave-btn-primary",
            onClick: onSearch,
            disabled: loading || !canSearch,
            title: canSearch
              ? seedCount
                ? "Search from marked seed tracks"
                : "Search using this playlist as context (no seeds marked)"
              : WeaveI18n.t("search.seedsNeeded"),
          },
          loading ? WeaveI18n.t("picker.loading") : WeaveI18n.t("common.search")
        ),
        h(
          "button",
          {
            type: "button",
            className: "weave-icon-btn",
            onClick: onClose,
            title: WeaveI18n.t("common.close"),
            "aria-label": WeaveI18n.t("common.close"),
          },
          "✕"
        )
      )
    ),

    error ? h("div", { className: "weave-error" }, error) : null,

    h(
      "div",
      { className: "weave-search-panel-body" },
      h(
        "div",
        { className: "weave-search-panel-block" },
        h("h3", null, WeaveI18n.t("search.featureRanges")),
        h(WeaveFeatureSliders, {
          features,
          onChange: onFeaturesChange,
          disabled: loading,
          seedTracks: (() => {
            const seeds = (tracks || []).filter((t) => seedUris?.includes(t.uri));
            // No seeds → playlist average (same soft-seed context as search).
            return seeds.length ? seeds : tracks || [];
          })(),
        })
      ),

      h(
        "div",
        { className: "weave-search-panel-block weave-camelot-block" },
        h(
          "div",
          { className: "weave-camelot-filters-head" },
          h(
            "h3",
            {
              className: "weave-tip",
              "data-tip":
                "Keep results that mix harmonically with your seed (or playlist) keys on the Camelot wheel. Select any combination — a track matches if any selected move reaches it. Leave all off to skip key filtering.",
            },
            WeaveI18n.t("search.mixInKey")
          ),
          h(
            "span",
            { className: "weave-recommend-meta" },
            (() => {
              const seeds = (tracks || [])
                .filter((t) => seedUris?.includes(t.uri))
                .map((t) => WeaveFeatures.parseCamelot(t)?.label)
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
          {
            className: "weave-camelot-moves",
            role: "group",
            "aria-label": "Camelot moves",
          },
          WeaveFeatures.CAMELOT_MOVES.map((move) => {
            const selected = Array.isArray(filters.camelotMoves)
              ? filters.camelotMoves.includes(move.id)
              : false;
            return h(
              "button",
              {
                key: move.id,
                type: "button",
                className: "weave-camelot-chip weave-tip" + (selected ? " is-on" : ""),
                "data-tip": moveHint(move) + " · " + move.example,
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
              h("span", { className: "weave-camelot-chip-label" }, moveLabel(move)),
              h("span", { className: "weave-camelot-chip-example" }, move.example)
            );
          })
        )
      ),

      h(
        "div",
        { className: "weave-search-panel-block weave-filters-bar" },
        h(
          "h3",
          {
            className: "weave-tip",
            "data-tip":
              "Post-filters applied after candidates are fetched. They remove tracks that don’t match these rules.",
          },
          WeaveI18n.t("search.filters")
        ),
        h(
          "div",
          { className: "weave-filters-row" },
          h(
            "div",
            {
              className: "weave-camelot-moves weave-filter-chips",
              role: "group",
              "aria-label": "Result filters",
            },
            [
              {
                key: "hideExisting",
                label: WeaveI18n.t("search.hideInPlaylist"),
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
                label: WeaveI18n.t("search.hideArtists"),
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
                label: WeaveI18n.t("search.noExplicit"),
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
                label: WeaveI18n.t("search.noAberrant"),
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
                  className: "weave-camelot-chip weave-tip" + (f.on ? " is-on" : ""),
                  "data-tip": f.tip,
                  "aria-pressed": f.on,
                  onClick: f.toggle,
                },
                h("span", { className: "weave-camelot-chip-label" }, f.label)
              )
            )
          ),
          h(
            "div",
            { className: "weave-filters-end" },
            h(
              "div",
              {
                className: "weave-year-row weave-tip",
                "data-tip":
                  "Only keep tracks whose album release year falls between these values. Leave blank for no year limit.",
              },
              h(
                "label",
                { className: "weave-feature-field" },
                WeaveI18n.t("search.year"),
                h("input", {
                  type: "number",
                  placeholder: WeaveI18n.t("search.yearFrom"),
                  value: filters.yearMin,
                  onChange: (e) =>
                    onFiltersChange?.({ ...filters, yearMin: e.target.value }),
                })
              ),
              h(
                "label",
                { className: "weave-feature-field" },
                "\u00a0",
                h("input", {
                  type: "number",
                  placeholder: WeaveI18n.t("search.yearTo"),
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
