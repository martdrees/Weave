/**
 * Thin features façade — re-exports focused modules (ADR 005).
 * New code should import from domain/key, domain/metrics, or api/audioAttrs.
 */

export { trackIdFromUri } from "../domain/track.ts";

export {
  CAMELOT_MAJOR,
  CAMELOT_MINOR,
  CAMELOT_HUES,
  CAMELOT_MOVES,
  STANDARD_PITCH,
  normalizeMode,
  formatCamelot,
  parseCamelot,
  indexModeFromCamelotLabel,
  looksLikeCamelotLabel,
  camelotNumberFromLabel,
  camelotNumber,
  camelotBackground,
  formatStandardKey,
  standardFromPitchMode,
  formatKeyLabel,
  wrapCamelotNum,
  targetsForMove,
  camelotAllowedLabels,
  filterTracksByCamelotMoves,
  keyCompatDistance,
} from "../domain/key.ts";

export {
  METRICS,
  FEATURE_COLORS,
  formatMetric,
  metricValue,
  relativeNorm,
  featureColorId,
  featureColor,
  featureTint,
  relativeColor,
  rangeForMetric,
  bpmCompatDistance,
  absoluteAggregateChange,
  aggregateStats,
  histogram,
  defaultArrangerFilters,
  filtersActive,
  filterTracks,
  sortTracks,
} from "../domain/metrics.ts";

export {
  AUDIO_ATTRIBUTES_V2,
  parseAudioAttributesV2,
  fetchAudioAttributesV2Map,
  getFeatureSamples,
  getFeatureSampleMap,
  cacheSize,
  getNotationPreference,
  formatDisplayKey,
  enrichTracks,
  reformatTrackKeys,
} from "./audioAttrs.ts";
