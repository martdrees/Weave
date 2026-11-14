import React from "react";
import * as Features from "../../api/features.ts";
import type { TrackRow } from "../../types/track.ts";

export type FeatureColumn = {
  id: string;
  metricId?: string;
  label?: string;
  width?: string;
  always?: boolean;
  defaultVisible?: boolean;
};

export type FeatureCellsProps = {
  track: TrackRow;
  col: FeatureColumn;
  /**
   * When true (results tables), BPM falls back to Math.round(tempo).
   * Arranger keeps playlist bpm only.
   */
  bpmFallbackTempo?: boolean;
  /** Extra classes on the outer cell (e.g. weave-find-key). */
  className?: string;
  /** Title when KEY label is empty (Copy uses common.unknown). */
  emptyKeyTitle?: string;
};

function cell(
  classNameCell: string,
  children: React.ReactNode,
  style?: React.CSSProperties
): React.ReactElement {
  return (
    <div className={classNameCell} style={style || undefined}>
      {children}
    </div>
  );
}

/**
 * Shared KEY / BPM / metric cell rendering for Arranger, TrackTable, Copy.
 */
export function FeatureCells(props: FeatureCellsProps): React.ReactElement {
  const { track, col, bpmFallbackTempo = false, className, emptyKeyTitle } = props;

  if (col.id === "KEY") {
    const label = Features.formatDisplayKey(track);
    const bg = Features.camelotBackground(
      track.keyIndex,
      track.keyMode,
      track.key,
      track.keyColor
    );
    const classes = ["weave-col-feat", "weave-col-key", className]
      .filter(Boolean)
      .join(" ");
    return cell(
      classes,
      <span
        className={"weave-key-circle" + (label ? "" : " is-empty")}
        style={bg ? { background: bg } : undefined}
        title={label || emptyKeyTitle || undefined}
      >
        {label || "—"}
      </span>
    );
  }

  if (col.id === "BPM") {
    let text = "—";
    if (track.bpm != null && track.bpm !== "") {
      text = String(track.bpm);
    } else if (bpmFallbackTempo && track.tempo != null) {
      text = String(Math.round(Number(track.tempo)));
    }
    return cell(
      "weave-col-feat weave-col-bpm",
      <span
        className="weave-feat-pill"
        style={{ background: Features.featureTint("tempo") }}
      >
        {text}
      </span>
    );
  }

  const metricId = col.metricId;
  const metric = Features.METRICS.find((m) => m.id === metricId);
  const v = Features.metricValue(track, metric);
  const text = metric ? Features.formatMetric(metric, v) : "—";
  const bg = Features.featureTint(metricId || col.id);
  return cell(
    "weave-col-feat weave-col-" + (metricId || col.id.toLowerCase()),
    <span className="weave-feat-pill" style={{ background: bg }}>
      {text}
    </span>
  );
}
