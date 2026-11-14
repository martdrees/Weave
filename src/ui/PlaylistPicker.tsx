import React from "react";
import { t } from "../i18n/index.ts";

export type PlaylistOption = {
  uri: string;
  name: string;
  totalLength?: number | null;
};

export type PlaylistPickerProps = {
  playlists?: PlaylistOption[] | null;
  selectedUri?: string | null;
  loading?: boolean;
  compact?: boolean;
  trackCount?: number | null;
  onSelect?: (uri: string | null) => void;
  onRefresh?: () => void;
};

export function PlaylistPicker(props: PlaylistPickerProps): React.ReactElement {
  const { playlists, selectedUri, loading, compact, trackCount, onSelect, onRefresh } =
    props;

  return (
    <div className={"weave-picker" + (compact ? " weave-picker-compact" : "")}>
      {compact ? null : (
        <label className="weave-picker-label" htmlFor="weave-playlist-select">
          {t("picker.playlist")}
        </label>
      )}
      <div className="weave-picker-row">
        <select
          id="weave-playlist-select"
          className={"weave-select" + (compact ? " weave-select-toolbar" : "")}
          value={selectedUri || ""}
          disabled={loading || !playlists?.length}
          onChange={(e) => onSelect?.(e.target.value || null)}
          aria-label={t("picker.playlist")}
          title={t("picker.choose")}
        >
          <option value="">
            {loading
              ? t("picker.loading")
              : playlists?.length
                ? t("picker.select")
                : t("picker.empty")}
          </option>
          {(playlists || []).map((p) => (
            <option key={p.uri} value={p.uri}>
              {p.name + (p.totalLength != null ? ` (${p.totalLength})` : "")}
            </option>
          ))}
        </select>
        {trackCount != null && selectedUri ? (
          <span
            className="weave-picker-count"
            title={t("picker.tracks", { count: trackCount })}
          >
            {t("picker.tracks", { count: trackCount })}
          </span>
        ) : null}
        <button
          type="button"
          className={
            compact
              ? "weave-icon-btn weave-icon-btn-compact"
              : "weave-btn weave-btn-ghost"
          }
          onClick={onRefresh}
          disabled={loading}
          title={t("picker.refreshTitle")}
          aria-label={t("picker.refreshTitle")}
        >
          {compact ? "↻" : t("picker.refresh")}
        </button>
      </div>
    </div>
  );
}
