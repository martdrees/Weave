//@ts-check
/**
 * Spotify player sync + play/pause for arranger / result rows.
 *
 * Arranger play: start the clicked track, then queue the rest of Weave’s
 * current list so Next continues in editor order (including unsaved adds).
 * Uses public Player / addToQueue APIs — not private setQueue (breaks across
 * Spotify versions: "Cannot read properties of undefined (reading 'options')").
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
   * @param {string} uri
   */
  async function playOne(uri) {
    if (Spicetify?.Player?.playUri) {
      await Spicetify.Player.playUri(uri);
      return;
    }
    const PlayerAPI = Spicetify?.Platform?.PlayerAPI;
    if (PlayerAPI?.play) {
      await PlayerAPI.play({ uri }, {}, {});
      return;
    }
    throw new Error("No play API");
  }

  /**
   * Play `uris[0]`, then queue the remainder (Weave order).
   * @param {string[]} uris
   * @param {string|null|undefined} contextUri
   */
  async function playUriList(uris, contextUri) {
    const list = (uris || []).filter(Boolean);
    if (!list.length) throw new Error("No tracks to play");

    const first = list[0];
    const rest = list.slice(1);
    const PlayerAPI = Spicetify?.Platform?.PlayerAPI;

    // Saved playlist context when possible (native next-track). If Spotify
    // rejects it (e.g. unsaved track), fall through to explicit queue.
    if (contextUri && Spicetify?.Player?.playUri) {
      try {
        await Spicetify.Player.playUri(contextUri, {}, { skipTo: { uri: first } });
        const now =
          Spicetify?.Player?.data?.item?.uri ||
          Spicetify?.Player?.data?.track?.uri ||
          null;
        // Wrong track or empty → rebuild queue from Weave’s list.
        if (now && now !== first) {
          /* fall through */
        } else {
          return;
        }
      } catch (_) {
        /* fall through */
      }
    }

    try {
      await PlayerAPI?.clearQueue?.();
    } catch (_) {
      /* ignore */
    }

    await playOne(first);

    if (!rest.length) return;

    const items = rest.map((uri) => ({ uri }));
    const CHUNK = 80;
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      try {
        if (typeof Spicetify.addToQueue === "function") {
          await Spicetify.addToQueue(chunk);
        } else if (PlayerAPI?.addToQueue) {
          await PlayerAPI.addToQueue(chunk);
        }
      } catch (err) {
        console.warn("Weave: addToQueue failed", err);
        break;
      }
    }
  }

  /**
   * @param {object} track
   * @param {number} [index]
   * @param {{ tracks?: object[], playlistUri?: string|null }} [ctx]
   */
  async function handlePlay(track, index, ctx) {
    try {
      const uri = track?.uri;
      if (!uri) return;

      const playlistUri = ctx?.playlistUri || null;
      const tracks = Array.isArray(ctx?.tracks) ? ctx.tracks : [];

      const currentUri =
        Spicetify?.Player?.data?.item?.uri ||
        Spicetify?.Player?.data?.track?.uri ||
        playingUri;
      const currentlyPlaying = !!Spicetify?.Player?.isPlaying?.();

      if (currentUri === uri && currentlyPlaying) {
        if (Spicetify?.Player?.pause) {
          Spicetify.Player.pause();
        } else if (Spicetify?.Platform?.PlayerAPI?.pause) {
          await Spicetify.Platform.PlayerAPI.pause();
        }
        setIsPlaying(false);
        return;
      }

      if (currentUri === uri && !currentlyPlaying) {
        if (Spicetify?.Player?.play) {
          Spicetify.Player.play();
        } else if (Spicetify?.Platform?.PlayerAPI?.resume) {
          await Spicetify.Platform.PlayerAPI.resume();
        }
        setIsPlaying(true);
        return;
      }

      // Arranger: play this row, queue the rest in Weave order.
      if (tracks.length) {
        let start =
          typeof index === "number" && index >= 0
            ? index
            : tracks.findIndex((t) => t?.uri === uri);
        if (start < 0) start = 0;
        if (tracks[start]?.uri !== uri) {
          const byUri = tracks.findIndex((t) => t?.uri === uri);
          if (byUri >= 0) start = byUri;
        }
        const fromHere = tracks
          .slice(start)
          .map((t) => t?.uri)
          .filter(Boolean);
        if (!fromHere.length) fromHere.push(uri);
        await playUriList(fromHere, playlistUri);
        setPlayingUri(uri);
        setIsPlaying(true);
        return;
      }

      // Preview from search / add-track / etc.
      await playOne(uri);
      setPlayingUri(uri);
      setIsPlaying(true);
    } catch (err) {
      console.warn("Weave: play failed", err);
      MixAppApi.notify(MixAppI18n.t("notify.playbackFailed"), true);
    }
  }

  return {
    playingUri,
    isPlaying,
    handlePlay,
  };
}
