//@ts-check

/** Phase 5 — MixMoose “Add Track”: Spotify-style catalog search. */
function MixAppAddTrackModal(props) {
  const react = Spicetify.React;
  const { open, playlistTracks, playingUri, isPlaying, onClose, onAddTrack, onPlay } =
    props;

  const [query, setQuery] = react.useState("");
  const [results, setResults] = react.useState([]);
  const [loading, setLoading] = react.useState(false);
  const [error, setError] = react.useState(null);
  const genRef = react.useRef(0);

  const existingIndex = react.useMemo(
    () => MixAppPlaylistOps.buildExistingIndex(playlistTracks),
    [playlistTracks]
  );

  react.useEffect(() => {
    if (!open) {
      genRef.current += 1;
      setQuery("");
      setResults([]);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  async function runSearch(e) {
    e?.preventDefault?.();
    const q = String(query || "").trim();
    if (!q) return;
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    try {
      let list = await MixAppApi.searchTracks(q, { limit: 30 });
      if (gen !== genRef.current) return;
      if (list.length) {
        try {
          list = await MixAppFeatures.enrichTracks(list.slice());
        } catch (enrichErr) {
          console.warn("Weave: add-track enrich failed", enrichErr);
        }
      }
      if (gen !== genRef.current) return;
      setResults(list);
      if (!list.length) setError(MixAppI18n.t("results.empty"));
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error(err);
      setResults([]);
      setError(err?.message || MixAppI18n.t("notify.searchFailed"));
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }

  return h(
    MixAppModal,
    {
      open,
      title: MixAppI18n.t("addTrack.title"),
      meta: results.length ? MixAppI18n.t("results.meta", { count: results.length }) : null,
      onClose,
      ariaLabel: MixAppI18n.t("addTrack.title"),
      className: "mixapp-find-modal mixapp-add-track-modal",
    },
    h(
      "form",
      {
        className: "mixapp-find-search-bar",
        onSubmit: runSearch,
      },
      h("input", {
        type: "search",
        className: "mixapp-find-input",
        placeholder: MixAppI18n.t("addTrack.placeholder"),
        value: query,
        autoFocus: true,
        onChange: (ev) => setQuery(ev.target.value),
      }),
      h(
        "button",
        {
          type: "submit",
          className: "mixapp-btn mixapp-btn-primary",
          disabled: loading || !String(query || "").trim(),
        },
        loading ? MixAppI18n.t("picker.loading") : MixAppI18n.t("addTrack.search")
      )
    ),
    error ? h("div", { className: "mixapp-find-error" }, error) : null,
    h(
      "div",
      { className: "mixapp-search-results-body" },
      h(MixAppTrackTable, {
        tracks: results,
        playingUri,
        isPlaying,
        onPlay,
        onAddTrack,
        disabledReason: (track) =>
          MixAppPlaylistOps.isInIndex(existingIndex, track)
            ? MixAppI18n.t("notify.alreadyInPlaylist")
            : null,
        rowClassName: (track) =>
          MixAppPlaylistOps.isInIndex(existingIndex, track) ? "is-in-playlist" : "",
        loading,
        loadingLabel: MixAppI18n.t("picker.loading"),
        emptyLabel: "Search Spotify’s catalog and add tracks to your playlist.",
      })
    )
  );
}
