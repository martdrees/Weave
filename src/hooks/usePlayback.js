//@ts-check
/**
 * Spotify player sync + play/pause for arranger / result rows.
 *
 * Arranger play prefers playlist context (`playUri(playlistUri, { skipTo })`)
 * now that Weave’s mirror matches Spotify after write-through. On failure or
 * provisional (just-added) rows, fall back to play-first + `addToQueue` in
 * Weave order. Never uses private setQueue (breaks across Spotify versions).
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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function currentPlayerUri() {
    return (
      Spicetify?.Player?.data?.item?.uri || Spicetify?.Player?.data?.track?.uri || null
    );
  }

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
   * Prefer playlist-context skipTo; return true when it appears to stick.
   * @param {string} playlistUri
   * @param {string} trackUri
   */
  async function tryPlaylistContextPlay(playlistUri, trackUri) {
    if (!playlistUri || !trackUri || !Spicetify?.Player?.playUri) return false;
    try {
      await Spicetify.Player.playUri(playlistUri, {}, { skipTo: { uri: trackUri } });
      await sleep(60);
      const now = currentPlayerUri();
      if (now && now !== trackUri) {
        console.warn(
          "Weave: playlist context play landed on a different track; falling back",
          { expected: trackUri, now }
        );
        return false;
      }
      return true;
    } catch (err) {
      console.warn("Weave: playlist context play failed; falling back", err);
      return false;
    }
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

    if (contextUri) {
      const ok = await tryPlaylistContextPlay(contextUri, first);
      if (ok) return;
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
   * @param {{
   *   tracks?: object[],
   *   playlistUri?: string|null,
   *   waitForReadyTrack?: (uri: string, timeoutMs?: number) => Promise<object|null>,
   *   getTracks?: () => object[],
   * }} [ctx]
   */
  async function handlePlay(track, index, ctx) {
    try {
      const uri = track?.uri;
      if (!uri) return;

      let playlistUri = ctx?.playlistUri || null;
      let tracks = Array.isArray(ctx?.tracks) ? ctx.tracks : [];

      const currentUri = currentPlayerUri() || playingUri;
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

      // Arranger: prefer playlist context; wait out provisional adds when possible.
      if (tracks.length) {
        let ready = track;
        if (
          playlistUri &&
          typeof ctx?.waitForReadyTrack === "function" &&
          MixAppPlaylistOps.isProvisionalPlaylistUid(track?.uid)
        ) {
          const settled = await ctx.waitForReadyTrack(uri, 2000);
          if (settled) ready = settled;
          // Refresh mirror after wait so queue order matches post-merge uids.
          if (typeof ctx?.getTracks === "function") {
            const fresh = ctx.getTracks();
            if (Array.isArray(fresh) && fresh.length) tracks = fresh;
          }
        }

        if (MixAppPlaylistOps.isProvisionalPlaylistUid(ready?.uid)) {
          // Spotify context still lacks this row — queue from Weave order instead.
          playlistUri = null;
          console.warn(
            "Weave: play fallback — track still provisional after wait",
            uri
          );
        }

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
