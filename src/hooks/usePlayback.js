//@ts-check
/**
 * Spotify player sync + play/pause for arranger / result rows.
 */

function MixAppUsePlayback() {
  const react = Spicetify.React;
  const [playingUri, setPlayingUri] = react.useState(null);
  const [isPlaying, setIsPlaying] = react.useState(false);

  function syncPlaybackState() {
    const data = Spicetify?.Player?.data;
    const uri = data?.item?.uri || data?.track?.uri || null;
    setPlayingUri(uri || null);
    setIsPlaying(!!Spicetify?.Player?.isPlaying?.());
  }

  react.useEffect(() => {
    syncPlaybackState();
    const player = Spicetify?.Player;
    if (!player?.addEventListener) return undefined;
    const onChange = () => syncPlaybackState();
    player.addEventListener("songchange", onChange);
    player.addEventListener("onplaypause", onChange);
    return () => {
      player.removeEventListener?.("songchange", onChange);
      player.removeEventListener?.("onplaypause", onChange);
    };
  }, []);

  /**
   * @param {object} track
   * @param {number} index
   * @param {{ tracks?: object[], playlistUri?: string|null }} ctx
   */
  function handlePlay(track, index, ctx) {
    try {
      const uri = track?.uri;
      if (!uri) return;

      const tracks = ctx?.tracks || [];
      const playlistUri = ctx?.playlistUri || null;

      const currentUri =
        Spicetify?.Player?.data?.item?.uri ||
        Spicetify?.Player?.data?.track?.uri ||
        playingUri;
      const currentlyPlaying = !!Spicetify?.Player?.isPlaying?.();

      if (currentUri === uri && currentlyPlaying) {
        if (Spicetify?.Player?.pause) {
          Spicetify.Player.pause();
        } else if (Spicetify?.Platform?.PlayerAPI?.pause) {
          Spicetify.Platform.PlayerAPI.pause();
        }
        setIsPlaying(false);
        return;
      }

      if (currentUri === uri && !currentlyPlaying && Spicetify?.Player?.play) {
        Spicetify.Player.play();
        setIsPlaying(true);
        return;
      }

      const uris = tracks.map((t) => t.uri).filter(Boolean);
      if (Spicetify?.Player?.playUri) {
        Spicetify.Player.playUri(uri);
        setPlayingUri(uri);
        setIsPlaying(true);
        return;
      }
      if (Spicetify?.Platform?.PlayerAPI?.play) {
        Spicetify.Platform.PlayerAPI.play({ uri }, {}, { skipToUri: uri });
        setPlayingUri(uri);
        setIsPlaying(true);
        return;
      }
      if (uris.length && Spicetify?.Platform?.PlayerAPI?.play) {
        Spicetify.Platform.PlayerAPI.play(
          { uri: playlistUri },
          {},
          { skipToIndex: index }
        );
        setPlayingUri(uri);
        setIsPlaying(true);
      }
    } catch (err) {
      console.warn("Weave: play failed", err);
      MixAppApi.notify("Could not start playback", true);
    }
  }

  return {
    playingUri,
    isPlaying,
    handlePlay,
  };
}
