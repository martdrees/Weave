//@ts-check
/**
 * Spotify player sync + play/pause for arranger / result rows.
 *
 * Arranger play queues Weave’s current track list from the clicked row
 * (including unsaved adds/reorders) so Next continues like a playlist —
 * not radio, and not Spotify’s possibly stale remote playlist snapshot.
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
   * Replace the queue with `uris` (from the clicked track onward) and start.
   * Uses Shuffle+-style setQueue when available; otherwise play + addToQueue.
   * @param {string[]} uris
   * @param {string|null|undefined} contextUri
   */
  async function playUriList(uris, contextUri) {
    const list = (uris || []).filter(Boolean);
    if (!list.length) throw new Error("No tracks to play");

    const PlayerAPI = Spicetify?.Platform?.PlayerAPI;
    const queueHandle = PlayerAPI?._queue;
    const setQueue = queueHandle?._client?.setQueue;

    // Preferred: inject the full remaining list as context (reliable next-track).
    if (typeof setQueue === "function") {
      const queued = list.slice();
      queued.push("spotify:delimiter");
      const state = queueHandle._queue || {};
      setQueue({
        nextTracks: queued.map((uri) => ({
          contextTrack: {
            uri,
            uid: "",
            metadata: { is_queued: "false" },
          },
          removed: [],
          blocked: [],
          provider: "context",
        })),
        prevTracks: state.prevTracks || [],
        queueRevision: state.queueRevision,
      });

      if (contextUri && typeof PlayerAPI.updateContext === "function") {
        try {
          const sessionId = PlayerAPI.getState?.()?.sessionId;
          if (sessionId) {
            PlayerAPI.updateContext(sessionId, {
              uri: contextUri,
              url: "context://" + contextUri,
            });
          }
        } catch (_) {
          /* context label is optional */
        }
      }

      Spicetify.Player.next();
      return;
    }

    // Fallback: play the first track, then silently queue the rest.
    const first = list[0];
    const rest = list.slice(1).map((uri) => ({ uri }));

    try {
      await PlayerAPI?.clearQueue?.();
    } catch (_) {
      /* ignore */
    }

    if (Spicetify?.Player?.playUri) {
      await Spicetify.Player.playUri(first);
    } else if (PlayerAPI?.play) {
      await PlayerAPI.play({ uri: first }, {}, {});
    } else {
      throw new Error("No play API");
    }

    if (rest.length) {
      if (typeof Spicetify.addToQueue === "function") {
        await Spicetify.addToQueue(rest);
      } else if (PlayerAPI?.addToQueue) {
        await PlayerAPI.addToQueue(rest);
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

      // Arranger: queue Weave’s list from this row (works with unsaved adds).
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
        const uris = tracks.slice(start).map((t) => t?.uri).filter(Boolean);
        if (!uris.length) uris.push(uri);
        await playUriList(uris, playlistUri);
        setPlayingUri(uri);
        setIsPlaying(true);
        return;
      }

      // Preview from search / add-track / etc.: single track only.
      if (Spicetify?.Player?.playUri) {
        await Spicetify.Player.playUri(uri);
      } else if (Spicetify?.Platform?.PlayerAPI?.play) {
        await Spicetify.Platform.PlayerAPI.play({ uri }, {}, {});
      } else {
        throw new Error("No play API");
      }
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
