/** Full-width search / filter bar (between toolbar and playlist table). */

import React from "react";
import * as Features from "../api/features.ts";
import * as Recommend from "../api/recommend.ts";
import { t, camelotMoveHint, camelotMoveLabel } from "../i18n/index.ts";
import type { SearchFilters } from "../state/prefsStore.ts";
import type { TrackRow } from "../types/track.ts";
import { FeatureSliders, type FeatureState } from "./FeatureSliders.tsx";

export type SearchPanelProps = {
  open: boolean;
  seedUris?: string[] | null;
  tracks?: TrackRow[] | null;
  features?: FeatureState | null;
  filters: SearchFilters;
  resultLimit?: number;
  loading?: boolean;
  fitting?: boolean;
  error?: string | null;
  onClose?: () => void;
  onFeaturesChange?: (next: FeatureState) => void;
  onFiltersChange?: (next: SearchFilters) => void;
  onResultLimitChange?: (limit: number) => void;
  onFitToSeeds?: () => void;
  onResetFeatures?: () => void;
  onSearch?: () => void;
};

export function SearchPanel(props: SearchPanelProps): React.ReactElement | null {
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

  const seedList = seedUris || [];
  const seedCount = seedList.length;
  const hasPlaylistTracks = Array.isArray(tracks) && tracks.length > 0;
  const canSearch = seedCount > 0 || hasPlaylistTracks;

  const seedNames = (tracks || [])
    .filter((tr) => seedList.includes(tr.uri))
    .map((tr) => tr.name)
    .slice(0, 8);

  const seedTracksForSliders = (() => {
    const seeds = (tracks || []).filter((tr) => seedList.includes(tr.uri));
    return seeds.length ? seeds : tracks || [];
  })();

  const camelotMeta = (() => {
    const seeds = (tracks || [])
      .filter((tr) => seedList.includes(tr.uri))
      .map((tr) => Features.parseCamelot(tr)?.label)
      .filter(Boolean);
    const unique = [...new Set(seeds)];
    if (unique.length) {
      return "from " + unique.join(", ");
    }
    if (seedCount) {
      return "needs seed keys · leave all off to skip";
    }
    if (hasPlaylistTracks) {
      return "from playlist keys · leave all off to skip";
    }
    return "needs keys · leave all off to skip";
  })();

  const searchTitle =
    canSearch && !seedCount && hasPlaylistTracks
      ? "Search using this playlist as context (no seeds marked)"
      : seedCount
        ? "Search from marked seed tracks"
        : t("search.seedsNeeded");

  return (
    <section className="weave-search-panel" aria-label={t("search.filters")}>
      <div className="weave-search-panel-header">
        <div className="weave-search-panel-title-row">
          <h2>{t("search.title")}</h2>
          <span className="weave-recommend-meta">
            {seedCount
              ? t(seedCount === 1 ? "toolbar.seed" : "toolbar.seeds", {
                  count: seedCount,
                }) +
                (seedNames.length
                  ? ": " + seedNames.join(", ") + (seedCount > 8 ? "…" : "")
                  : "")
              : hasPlaylistTracks
                ? "No seeds — searching from this playlist"
                : t("search.seedsNeeded")}
          </span>
        </div>
        <div className="weave-search-panel-header-actions">
          <button
            type="button"
            className="weave-btn weave-btn-ghost"
            onClick={onFitToSeeds}
            disabled={!seedCount || fitting}
            title={t("search.fitTitle")}
          >
            {fitting ? t("search.fitting") : t("search.fitToSeeds")}
          </button>
          <button
            type="button"
            className="weave-btn weave-btn-ghost"
            onClick={onResetFeatures}
          >
            {t("search.resetRanges")}
          </button>
          <label className="weave-result-limit">
            {t("search.maxResults")}
            <select
              className="weave-select weave-select-compact"
              value={resultLimit || Recommend.DEFAULT_LIMIT}
              onChange={(e) => onResultLimitChange?.(Number(e.target.value))}
              disabled={loading}
            >
              {[25, 50, 100, 150, 200].map((n) => (
                <option key={n} value={n}>
                  {String(n)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="weave-btn weave-btn-primary"
            onClick={onSearch}
            disabled={loading || !canSearch}
            title={canSearch ? searchTitle : t("search.seedsNeeded")}
          >
            {loading ? t("picker.loading") : t("common.search")}
          </button>
          <button
            type="button"
            className="weave-icon-btn"
            onClick={onClose}
            title={t("common.close")}
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>
      </div>

      {error ? <div className="weave-error">{error}</div> : null}

      <div className="weave-search-panel-body">
        <div className="weave-search-panel-block">
          <h3>{t("search.featureRanges")}</h3>
          <FeatureSliders
            features={features}
            onChange={onFeaturesChange}
            disabled={loading}
            seedTracks={seedTracksForSliders}
          />
        </div>

        <div className="weave-search-panel-block weave-camelot-block">
          <div className="weave-camelot-filters-head">
            <h3
              className="weave-tip"
              data-tip="Keep results that mix harmonically with your seed (or playlist) keys on the Camelot wheel. Select any combination — a track matches if any selected move reaches it. Leave all off to skip key filtering."
            >
              {t("search.mixInKey")}
            </h3>
            <span className="weave-recommend-meta">{camelotMeta}</span>
          </div>
          <div className="weave-camelot-moves" role="group" aria-label="Camelot moves">
            {Features.CAMELOT_MOVES.map((move) => {
              const selected = Array.isArray(filters.camelotMoves)
                ? filters.camelotMoves.includes(move.id)
                : false;
              return (
                <button
                  key={move.id}
                  type="button"
                  className={
                    "weave-camelot-chip weave-tip" + (selected ? " is-on" : "")
                  }
                  data-tip={camelotMoveHint(move) + " · " + (move.example || "")}
                  aria-pressed={selected}
                  onClick={() => {
                    const prev = Array.isArray(filters.camelotMoves)
                      ? filters.camelotMoves
                      : [];
                    const next = selected
                      ? prev.filter((id) => id !== move.id)
                      : [...new Set([...prev, move.id])];
                    onFiltersChange?.({ ...filters, camelotMoves: next });
                  }}
                >
                  <span className="weave-camelot-chip-label">
                    {camelotMoveLabel(move)}
                  </span>
                  <span className="weave-camelot-chip-example">{move.example}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="weave-search-panel-block weave-filters-bar">
          <h3
            className="weave-tip"
            data-tip="Post-filters applied after candidates are fetched. They remove tracks that don’t match these rules."
          >
            {t("search.filters")}
          </h3>
          <div className="weave-filters-row">
            <div
              className="weave-camelot-moves weave-filter-chips"
              role="group"
              aria-label="Result filters"
            >
              {[
                {
                  key: "hideExisting",
                  label: t("search.hideInPlaylist"),
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
                  label: t("search.hideArtists"),
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
                  label: t("search.noExplicit"),
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
                  label: t("search.noAberrant"),
                  tip: "Exclude odd versions and mix titles — sped up, slowed + reverb, nightcore, DJ/continuous mixes, TikTok edits, and similar.",
                  on: !!filters.excludeAberrant,
                  toggle: () =>
                    onFiltersChange?.({
                      ...filters,
                      excludeAberrant: !filters.excludeAberrant,
                    }),
                },
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={"weave-camelot-chip weave-tip" + (f.on ? " is-on" : "")}
                  data-tip={f.tip}
                  aria-pressed={f.on}
                  onClick={f.toggle}
                >
                  <span className="weave-camelot-chip-label">{f.label}</span>
                </button>
              ))}
            </div>
            <div className="weave-filters-end">
              <div
                className="weave-year-row weave-tip"
                data-tip="Only keep tracks whose album release year falls between these values. Leave blank for no year limit."
              >
                <label className="weave-feature-field">
                  {t("search.year")}
                  <input
                    type="number"
                    placeholder={t("search.yearFrom")}
                    value={filters.yearMin}
                    onChange={(e) =>
                      onFiltersChange?.({
                        ...filters,
                        yearMin: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="weave-feature-field">
                  {"\u00a0"}
                  <input
                    type="number"
                    placeholder={t("search.yearTo")}
                    value={filters.yearMax}
                    onChange={(e) =>
                      onFiltersChange?.({
                        ...filters,
                        yearMax: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
