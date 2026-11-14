/**
 * Phase 6 — Generator: build a new playlist via the same recommend engine.
 * Does not alter the Recommendations panel; opens as its own modal.
 */

import React from "react";
import { t } from "../i18n/index.ts";
import * as Features from "../api/features.ts";
import * as Recommend from "../api/recommend.ts";
import * as Flowify from "../api/flowify.ts";
import * as Prefs from "../state/prefsStore.ts";
import type { TrackRow } from "../types/track.ts";
import { createGeneratedPlaylist } from "../hooks/createGeneratedPlaylist.ts";
import { Modal } from "./Modal.tsx";
import { FeatureSliders, type FeatureState } from "./FeatureSliders.tsx";
import { TrackTable } from "./TrackTable.tsx";

export type GeneratorModalProps = {
  open: boolean;
  playlist?: { name?: string } | null;
  tracks?: TrackRow[] | null;
  seedUris?: string[] | null;
  playingUri?: string | null;
  isPlaying?: boolean;
  onClose?: () => void;
  onCreated?: (uri: string) => void;
  onPlay?: (track: TrackRow, index?: number) => void;
};

export function GeneratorModal(props: GeneratorModalProps): React.ReactElement | null {
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

  const prefsGen = Prefs.load()?.generator || {};
  const [name, setName] = React.useState("");
  const [limit, setLimit] = React.useState(() => prefsGen.limit || 40);
  const [features, setFeatures] = React.useState<FeatureState>(() =>
    Recommend.defaultFeatureState()
  );
  const [excludeExplicit, setExcludeExplicit] = React.useState(
    () => !!prefsGen.excludeExplicit
  );
  const [excludeAberrant, setExcludeAberrant] = React.useState(
    () => prefsGen.excludeAberrant !== false
  );
  const [flowifyAfter, setFlowifyAfter] = React.useState(
    () => prefsGen.flowifyAfter !== false
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<TrackRow[]>([]);
  const genRef = React.useRef(0);

  React.useEffect(() => {
    if (open) {
      setName(
        playlist?.name
          ? t("playlist.weaveSuffix", { name: playlist.name })
          : t("generator.defaultName")
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

  async function runGenerate(): Promise<void> {
    if (!canRun) {
      setError(t("notify.needSeedsOrPlaylist"));
      return;
    }
    const gen = ++genRef.current;
    setBusy(true);
    setError(null);
    setPreview([]);
    try {
      const seedTrackIds = (seedUris || [])
        .map((uri) => Recommend.trackIdFromUri(uri))
        .filter(Boolean) as string[];
      const seedTracks = (tracks || []).filter((tr) =>
        (seedUris || []).includes(tr.uri)
      );

      const result = await Recommend.recommend({
        seedTrackIds,
        seedTracks,
        contextTracks: tracks || [],
        features,
        limit: Math.min(Recommend.MAX_LIMIT, Math.max(10, Number(limit) || 40)),
        filters: {
          excludeExplicit: !!excludeExplicit,
          excludeAberrant: !!excludeAberrant,
          includeSeedTracks: false,
          hideExistingUris: (tracks || []).map((tr) => tr.uri).filter(Boolean),
          hideExistingTracks: tracks || [],
        },
      });

      if (gen !== genRef.current) return;

      let list = Array.isArray(result?.tracks) ? result.tracks.slice() : [];
      try {
        const out = await Features.enrichTracks(list);
        list = (out as TrackRow[] | undefined) || list;
      } catch (err) {
        console.warn("Weave generator enrich", err);
      }

      if (flowifyAfter && list.length > 2) {
        list = Flowify.arrange(list, {
          method: "sets",
          setSize: 4,
          weights: Flowify.defaultWeights(),
        }) as TrackRow[];
      }

      if (gen !== genRef.current) return;
      try {
        Prefs.patch({
          generator: {
            limit,
            flowifyAfter,
            excludeExplicit,
            excludeAberrant,
          },
        });
      } catch {
        /* ignore */
      }
      setPreview(list);
      if (!list.length) {
        setError(t("notify.noMatches"));
      }
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setError(err instanceof Error ? err.message : t("notify.searchFailed"));
      setPreview([]);
    } finally {
      if (gen === genRef.current) setBusy(false);
    }
  }

  async function createFromPreview(): Promise<void> {
    if (!preview.length) {
      setError("Generate tracks first");
      return;
    }
    const title = String(name || "").trim() || t("generator.defaultName");
    setBusy(true);
    setError(null);
    try {
      const uri = await createGeneratedPlaylist(
        title,
        preview.map((tr) => tr.uri).filter(Boolean)
      );
      onCreated?.(uri);
      onClose?.();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : t("notify.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={t("generator.title")}
      meta={preview.length ? t("picker.tracks", { count: preview.length }) : null}
      onClose={onClose}
      ariaLabel={t("generator.title")}
      className="weave-find-modal weave-generator-modal"
      closeDisabled={busy}
    >
      <div className="weave-generator-body">
        <div className="weave-generator-settings">
          <p className="weave-recommend-meta">
            {seedCount
              ? t(seedCount === 1 ? "toolbar.seed" : "toolbar.seeds", {
                  count: seedCount,
                })
              : "No seeds marked — soft-seeds from the current playlist."}
          </p>
          <div className="weave-generator-fields">
            <label className="weave-flowify-field">
              <span>{t("generator.name")}</span>
              <input
                type="text"
                className="weave-find-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="weave-flowify-field weave-generator-limit">
              <span>{t("generator.size")}</span>
              <input
                type="number"
                className="weave-find-input"
                min={10}
                max={Recommend.MAX_LIMIT}
                value={limit}
                onChange={(e) =>
                  setLimit(
                    Math.max(
                      10,
                      Math.min(Recommend.MAX_LIMIT, parseInt(e.target.value, 10) || 40)
                    )
                  )
                }
                disabled={busy}
              />
            </label>
          </div>
          <div className="weave-generator-features">
            <h3>{t("search.featureRanges")}</h3>
            <FeatureSliders
              features={features}
              onChange={setFeatures}
              disabled={busy}
              seedTracks={
                seedCount
                  ? (tracks || []).filter((tr) => (seedUris || []).includes(tr.uri))
                  : tracks || []
              }
            />
          </div>
          <div className="weave-generator-checks">
            <label>
              <input
                type="checkbox"
                checked={excludeExplicit}
                disabled={busy}
                onChange={(e) => setExcludeExplicit(e.target.checked)}
              />{" "}
              {t("generator.excludeExplicit")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={excludeAberrant}
                disabled={busy}
                onChange={(e) => setExcludeAberrant(e.target.checked)}
              />{" "}
              {t("generator.excludeAberrant")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={flowifyAfter}
                disabled={busy}
                onChange={(e) => setFlowifyAfter(e.target.checked)}
              />{" "}
              {t("generator.flowifyAfter")}
            </label>
          </div>
          {error ? (
            <div className="weave-find-error weave-generator-error">{error}</div>
          ) : null}
          <div className="weave-flowify-actions">
            <button
              type="button"
              className="weave-btn"
              onClick={() => void runGenerate()}
              disabled={busy || !canRun}
            >
              {busy && !preview.length
                ? t("generator.generating")
                : t("generator.generate")}
            </button>
            <button
              type="button"
              className="weave-btn weave-btn-primary"
              onClick={() => void createFromPreview()}
              disabled={busy || !preview.length}
            >
              {busy && preview.length ? t("generator.creating") : t("generator.create")}
            </button>
          </div>
        </div>
        <div className="weave-generator-preview">
          <div className="weave-generator-preview-head">
            <h3>{t("generator.preview")}</h3>
            {preview.length ? (
              <span className="weave-recommend-meta">
                Play to audition before creating
              </span>
            ) : null}
          </div>
          <div className="weave-search-results-body">
            <TrackTable
              tracks={preview}
              playingUri={playingUri}
              isPlaying={isPlaying}
              onPlay={onPlay}
              loading={busy && !preview.length}
              loadingLabel={t("generator.generating")}
              emptyLabel={
                error
                  ? error
                  : canRun
                    ? "Press Generate to preview tracks here."
                    : t("notify.needSeedsOrPlaylist")
              }
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
