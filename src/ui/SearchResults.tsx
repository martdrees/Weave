/** Search results as a large modal with a playlist-style track table. */

import React from "react";
import { t } from "../i18n/index.ts";
import type { TrackRow } from "../types/track.ts";
import { Modal } from "./Modal.tsx";
import { TrackTable } from "./TrackTable.tsx";

export type SearchResultsProps = {
  open: boolean;
  results?: TrackRow[] | null;
  loading?: boolean;
  playingUri?: string | null;
  isPlaying?: boolean;
  onClose?: () => void;
  onAddTrack?: (track: TrackRow) => void;
  onHideTrack?: (track: TrackRow) => void;
  onPlay?: (track: TrackRow, index?: number) => void;
};

export function SearchResults(props: SearchResultsProps): React.ReactElement {
  const {
    open,
    results,
    loading,
    playingUri,
    isPlaying,
    onClose,
    onAddTrack,
    onHideTrack,
    onPlay,
  } = props;

  const count = Array.isArray(results) ? results.length : 0;

  return (
    <Modal
      open={open}
      title={t("results.title")}
      meta={count ? t("results.meta", { count }) : null}
      onClose={onClose}
      ariaLabel={t("results.aria")}
      closeTitle={t("results.close")}
    >
      <div className="weave-search-results-body">
        <TrackTable
          tracks={results}
          playingUri={playingUri}
          isPlaying={isPlaying}
          onPlay={onPlay}
          onAddTrack={onAddTrack}
          onHideTrack={onHideTrack}
          loading={loading}
          loadingLabel={t("results.searching")}
          emptyLabel={t("results.emptyHint")}
        />
      </div>
    </Modal>
  );
}
