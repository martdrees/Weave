import React from "react";
import type { TrackRow } from "../../types/track.ts";

export type PlayButtonProps = {
  track: TrackRow | null | undefined;
  playingUri?: string | null;
  isPlaying?: boolean;
  onPlay?: (track: TrackRow, index?: number) => void;
  index?: number;
  disabled?: boolean;
  /** Arranger pending-play (uid not ready yet). */
  pending?: boolean;
  playLabel?: string;
  pauseLabel?: string;
  pendingLabel?: string;
};

/**
 * Shared play/pause control for Arranger, TrackTable, and Copy.
 */
export function PlayButton(props: PlayButtonProps): React.ReactElement {
  const {
    track,
    playingUri,
    isPlaying,
    onPlay,
    index,
    disabled,
    pending,
    playLabel: playLabelProp,
    pauseLabel: pauseLabelProp,
    pendingLabel,
  } = props;

  const active = !!(track?.uri && track.uri === playingUri && isPlaying);
  const name = track?.name || "track";
  const playLabel = pending
    ? pendingLabel || "Waiting…"
    : active
      ? pauseLabelProp || "Pause " + name
      : playLabelProp || "Play " + name;

  return (
    <button
      type="button"
      className={"weave-play-btn" + (active ? " is-playing" : "")}
      disabled={!!disabled || !!pending}
      onClick={(e) => {
        e.stopPropagation();
        if (pending || !track) return;
        onPlay?.(track, index);
      }}
      title={playLabel}
      aria-label={playLabel}
    >
      <svg
        viewBox="0 0 16 16"
        width={14}
        height={14}
        aria-hidden="true"
        focusable="false"
      >
        {active ? (
          <path fill="currentColor" d="M3.5 2h3v12h-3V2zm6 0h3v12h-3V2z" />
        ) : (
          <path fill="currentColor" d="M3 2.5v11l10-5.5L3 2.5z" />
        )}
      </svg>
    </button>
  );
}
