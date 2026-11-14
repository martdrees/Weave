/** Flowify: live preview rearrange by curves/sets, then Apply or Save as new. */

import React from "react";
import { t, featureLabel } from "../i18n/index.ts";
import * as Features from "../api/features.ts";
import * as Flowify from "../api/flowify.ts";
import * as Prefs from "../state/prefsStore.ts";
import type { TrackRow } from "../types/track.ts";
import { Modal } from "./Modal.tsx";
import { TrackTable } from "./TrackTable.tsx";

type FlowifyOptions = ReturnType<typeof Flowify.defaultOptions>;

export type FlowifyModalProps = {
  open: boolean;
  tracks?: TrackRow[] | null;
  onClose?: () => void;
  onApply?: (preview: TrackRow[]) => Promise<boolean | void> | boolean | void;
  onSaveAsNew?: (preview: TrackRow[]) => Promise<boolean | void> | boolean | void;
  playingUri?: string | null;
  isPlaying?: boolean;
  onPlay?: (track: TrackRow, index?: number) => void;
};

export function FlowifyModal(props: FlowifyModalProps): React.ReactElement | null {
  const { open, tracks, onClose, onApply, onSaveAsNew, playingUri, isPlaying, onPlay } =
    props;

  const [options, setOptions] = React.useState<FlowifyOptions>(() => {
    const saved = Prefs.load()?.flowify;
    return saved
      ? { ...Flowify.defaultOptions(), ...(saved as Partial<FlowifyOptions>) }
      : Flowify.defaultOptions();
  });
  const [enriching, setEnriching] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [enriched, setEnriched] = React.useState<TrackRow[] | null>(null);
  const [preview, setPreview] = React.useState<TrackRow[] | null>(null);

  const count = Array.isArray(tracks) ? tracks.length : 0;
  const active = Flowify.activeWeights(options.weights);
  const previewCount = Array.isArray(preview) ? preview.length : 0;
  const busy = enriching || committing;
  const tracksKey = React.useMemo(
    () =>
      Array.isArray(tracks)
        ? tracks.map((tr) => String(tr?.uid || tr?.uri || "")).join("\0")
        : "",
    [tracks]
  );

  React.useEffect(() => {
    if (!open) {
      setEnriching(false);
      setCommitting(false);
      setError(null);
      setEnriched(null);
      setPreview(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || committing) return undefined;
    if (!count) {
      setEnriched(null);
      setPreview(null);
      setError(t("flowify.needPlaylist"));
      return undefined;
    }
    let cancelled = false;
    setEnriching(true);
    setError(null);
    (async () => {
      let list = (tracks || []).map((tr) =>
        tr && typeof tr === "object" ? { ...tr } : tr
      ) as TrackRow[];
      try {
        try {
          const out = await Features.enrichTracks(list);
          list = (out as TrackRow[] | undefined) || list;
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
  }, [open, tracksKey, count, committing, tracks]);

  React.useEffect(() => {
    if (!open || committing) return undefined;
    if (!enriched || !enriched.length) {
      setPreview(null);
      return undefined;
    }
    if (!active.length) {
      setPreview(null);
      setError(t("flowify.needWeight"));
      return undefined;
    }
    const timer = setTimeout(() => {
      try {
        const next = Flowify.arrange(enriched, options) as TrackRow[];
        setPreview(next);
        setError(null);
        try {
          Prefs.patch({ flowify: options as Record<string, unknown> });
        } catch {
          /* ignore */
        }
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : t("flowify.failed"));
        setPreview(null);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [open, enriched, options, active.length, committing]);

  function patch(partial: Partial<FlowifyOptions>): void {
    setOptions((prev) => ({ ...prev, ...partial }));
  }

  function setWeight(id: string, value: string | number): void {
    setOptions((prev) => ({
      ...prev,
      weights: { ...prev.weights, [id]: Number(value) },
    }));
  }

  function toggleInvert(id: string): void {
    setOptions((prev) => ({
      ...prev,
      invert: { ...prev.invert, [id]: !prev.invert?.[id] },
    }));
  }

  function resetOptions(): void {
    setOptions(Flowify.defaultOptions());
  }

  async function handleApply(): Promise<void> {
    if (!previewCount || committing || !preview) {
      setError(t("flowify.needPreview"));
      return;
    }
    setCommitting(true);
    setError(null);
    try {
      const ok = await onApply?.(preview);
      if (ok !== false) onClose?.();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : t("flowify.failed"));
    } finally {
      setCommitting(false);
    }
  }

  async function handleSaveAsNew(): Promise<void> {
    if (!previewCount || committing || !preview) {
      setError(t("flowify.needPreview"));
      return;
    }
    setCommitting(true);
    setError(null);
    try {
      const ok = await onSaveAsNew?.(preview);
      if (ok !== false) onClose?.();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : t("flowify.failed"));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Modal
      open={open}
      title={t("flowify.title")}
      meta={t("picker.tracks", { count })}
      onClose={onClose}
      ariaLabel={t("flowify.title")}
      className="weave-find-modal weave-flowify-modal"
      closeDisabled={busy}
    >
      <div className="weave-flowify-body">
        <div className="weave-flowify-settings">
          <p className="weave-recommend-meta">{t("flowify.blurb")}</p>
          <div className="weave-copy-tabs">
            <button
              type="button"
              className={
                "weave-btn weave-btn-ghost" +
                (options.method === "sets" ? " weave-btn-active" : "")
              }
              onClick={() => patch({ method: "sets" })}
              disabled={busy}
            >
              {t("flowify.sets")}
            </button>
            <button
              type="button"
              className={
                "weave-btn weave-btn-ghost" +
                (options.method === "curves" ? " weave-btn-active" : "")
              }
              onClick={() => patch({ method: "curves" })}
              disabled={busy}
            >
              {t("flowify.curves")}
            </button>
          </div>
          {options.method === "sets" ? (
            <label className="weave-flowify-field">
              <span>{t("flowify.setSize")}</span>
              <input
                type="number"
                className="weave-find-input"
                min={2}
                max={20}
                value={options.setSize}
                disabled={busy}
                onChange={(e) =>
                  patch({
                    setSize: Math.max(
                      2,
                      Math.min(20, parseInt(e.target.value, 10) || 4)
                    ),
                  })
                }
              />
            </label>
          ) : (
            <label className="weave-flowify-field">
              <span>{t("flowify.curveShape")}</span>
              <select
                className="weave-select weave-find-input"
                value={options.curvePreset}
                disabled={busy}
                onChange={(e) => patch({ curvePreset: e.target.value })}
              >
                {Flowify.CURVE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="weave-flowify-weights">
            <h3>{t("flowify.weights")}</h3>
            {Flowify.FEATURE_IDS.map((id) => (
              <div key={id} className="weave-flowify-weight-row">
                <span className="weave-flowify-weight-label">{featureLabel(id)}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={options.weights[id] || 0}
                  disabled={busy}
                  onChange={(e) => setWeight(id, e.target.value)}
                  aria-label={featureLabel(id)}
                />
                <span className="weave-flowify-weight-val">
                  {String(options.weights[id] || 0) + "%"}
                </span>
                {options.method === "curves" ? (
                  <button
                    type="button"
                    className={
                      "weave-btn weave-btn-ghost weave-btn-compact" +
                      (options.invert?.[id] ? " weave-btn-active" : "")
                    }
                    title={t("flowify.invert")}
                    disabled={busy}
                    onClick={() => toggleInvert(id)}
                  >
                    {t("flowify.inv")}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {error ? <div className="weave-find-error">{error}</div> : null}
          <div className="weave-flowify-actions">
            <button
              type="button"
              className="weave-btn weave-btn-ghost"
              onClick={resetOptions}
              disabled={busy}
            >
              {t("common.reset")}
            </button>
            <button
              type="button"
              className="weave-btn weave-btn-ghost"
              onClick={() => void handleSaveAsNew()}
              disabled={busy || !previewCount}
              title={t("flowify.saveAsNewTitle")}
            >
              {committing ? t("toolbar.saving") : t("toolbar.saveAsNew")}
            </button>
            <button
              type="button"
              className="weave-btn weave-btn-primary"
              onClick={() => void handleApply()}
              disabled={busy || !previewCount}
              title={t("flowify.applyTitle")}
            >
              {committing ? t("flowify.working") : t("flowify.apply")}
            </button>
          </div>
        </div>
        <div className="weave-flowify-preview">
          <div className="weave-flowify-preview-head">
            <h3>{t("flowify.preview")}</h3>
            {previewCount ? (
              <span className="weave-recommend-meta">
                {t("picker.tracks", { count: previewCount })}
              </span>
            ) : null}
          </div>
          <div className="weave-search-results-body">
            <TrackTable
              tracks={preview || []}
              playingUri={playingUri}
              isPlaying={isPlaying}
              onPlay={onPlay}
              loading={enriching && !previewCount}
              loadingLabel={t("flowify.working")}
              emptyLabel={error || t("flowify.previewHint")}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
