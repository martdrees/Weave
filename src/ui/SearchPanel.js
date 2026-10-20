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

  const seedCount = (seedUris || []).length;
  const hasPlaylistTracks = Array.isArray(tracks) && tracks.length > 0;
  const canSearch = seedCount > 0 || hasPlaylistTracks;
  const seedNames = (tracks || [])
    .filter((t) => seedUris?.includes(t.uri))
    .map((t) => t.name)
    .slice(0, 8);

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
            title: "Set min/max from selected seed audio features",
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

    error ? h("div", { className: "mixapp-error" }, error) : null,

    h(
      "div",
      { className: "mixapp-search-panel-body" },
      h(
        "div",
        { className: "mixapp-search-panel-block" },
        h("h3", null, "Feature ranges"),
        h(MixAppFeatureSliders, {
          features,
          onChange: onFeaturesChange,
          disabled: loading,
          seedTracks: (() => {
            const seeds = (tracks || []).filter((t) =>
              seedUris?.includes(t.uri)
            );
            // No seeds → playlist average (same soft-seed context as search).
            return seeds.length ? seeds : tracks || [];
          })(),
        })
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
          {
            className: "mixapp-camelot-moves",
            role: "group",
            "aria-label": "Camelot moves",
          },
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
              h("span", { className: "mixapp-camelot-chip-label" }, move.label),
              h("span", { className: "mixapp-camelot-chip-example" }, move.example)
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
                  className: "mixapp-camelot-chip mixapp-tip" + (f.on ? " is-on" : ""),
                  "data-tip": f.tip,
                  "aria-pressed": f.on,
                  onClick: f.toggle,
                },
                h("span", { className: "mixapp-camelot-chip-label" }, f.label)
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
