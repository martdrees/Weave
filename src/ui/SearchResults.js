//@ts-check

/** Search results as a large modal with a playlist-style track table. */
function MixAppSearchResults(props) {
  const react = Spicetify.React;
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

  return h(
    MixAppModal,
    {
      open,
      title: "Results",
      meta: results?.length ? String(results.length) + " tracks" : null,
      onClose,
      ariaLabel: "Search results",
      closeTitle: "Close results",
    },
    h(
      "div",
      { className: "mixapp-search-results-body" },
      h(MixAppTrackTable, {
        tracks: results,
        playingUri,
        isPlaying,
        onPlay,
        onAddTrack,
        onHideTrack,
        loading,
        loadingLabel: "Searching…",
        emptyLabel: "No results. Adjust filters and press Search.",
      })
    )
  );
}
