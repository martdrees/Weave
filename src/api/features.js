//@ts-check
/**
 * Audio features (key / BPM) via spclient audio-attributes.
 * /v1/audio-features is often 429 from the desktop client; spclient works.
 * Key display: standard notation (C, C♯m, …) by default — matches “standard”
 * in Spotify’s key-notation-preference; Camelot when that preference is on.
 */

const MixAppFeatures = (() => {
  const CACHE = new Map(); // id -> { key, mode, tempo } | null
  const BATCH = 50;
  const SPCLIENT =
    "https://spclient.wg.spotify.com/audio-attributes/v1/audio-features";

  const PITCH = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  // Camelot numbers for pitch class 0..11 (major → B, minor → A)
  const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
  const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

  function trackIdFromUri(uri) {
    if (!uri || !String(uri).includes(":track:")) return null;
    return String(uri).split(":").pop() || null;
  }

  function formatStandard(key, mode) {
    if (key == null || key < 0 || key > 11) return null;
    const root = PITCH[key].replace(/#/g, "♯").replace(/b/g, "♭");
    return mode === 0 ? `${root}m` : root;
  }

  function formatCamelot(key, mode) {
    if (key == null || key < 0 || key > 11) return null;
    const n = mode === 0 ? CAMELOT_MINOR[key] : CAMELOT_MAJOR[key];
    return `${n}${mode === 0 ? "A" : "B"}`;
  }

  /**
   * Notation for MixApp: always standard (C, C♯m, …).
   * Optional Camelot alongside when Spotify’s preference has camelot enabled.
   */
  function getNotationPreference() {
    let camelot = false;
    try {
      const pref = Spicetify?.Platform?.LocalStorageAPI?.getItem?.(
        "key-notation-preference"
      );
      if (pref && typeof pref === "object") camelot = !!pref.camelot;
    } catch {
      /* ignore */
    }
    return { camelot, standard: true };
  }

  function formatKeyLabel(key, mode, pref = getNotationPreference()) {
    const std = formatStandard(key, mode);
    const cam = formatCamelot(key, mode);
    if (pref.camelot && std && cam) return `${cam} · ${std}`;
    return std || cam;
  }

  async function fetchBatch(ids) {
    if (!ids.length) return;
    const missing = ids.filter((id) => !CACHE.has(id));
    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH);
      const url = `${SPCLIENT}?ids=${chunk.join(",")}`;
      try {
        const res = await Spicetify.CosmosAsync.get(url);
        const list = res?.audio_features || res?.audioFeatures || [];
        for (let j = 0; j < chunk.length; j++) {
          const feat = list[j];
          if (feat && typeof feat.key === "number") {
            CACHE.set(chunk[j], {
              key: feat.key,
              mode: feat.mode,
              tempo: feat.tempo,
            });
          } else {
            CACHE.set(chunk[j], null);
          }
        }
      } catch (err) {
        console.warn("MixApp: audio-attributes batch failed", err);
        for (const id of chunk) {
          if (!CACHE.has(id)) CACHE.set(id, null);
        }
      }
    }
  }

  /**
   * Enrich track objects with bpm + key (display string) + raw keyIndex/mode.
   * Mutates and returns the same array reference for convenience.
   */
  async function enrichTracks(tracks) {
    if (!tracks?.length) return tracks;
    const ids = [];
    for (const t of tracks) {
      const id = trackIdFromUri(t.uri);
      if (id) ids.push(id);
    }
    await fetchBatch([...new Set(ids)]);
    const pref = getNotationPreference();
    for (const t of tracks) {
      const id = trackIdFromUri(t.uri);
      const feat = id ? CACHE.get(id) : null;
      if (!feat) {
        if (t.bpm == null) t.bpm = null;
        if (t.key == null) t.key = null;
        continue;
      }
      t.keyIndex = feat.key;
      t.keyMode = feat.mode;
      t.bpm =
        feat.tempo != null && !Number.isNaN(feat.tempo)
          ? Math.round(feat.tempo)
          : t.bpm ?? null;
      t.key = formatKeyLabel(feat.key, feat.mode, pref);
    }
    return tracks;
  }

  /** Re-format key labels after notation preference changes. */
  function reformatTrackKeys(tracks) {
    const pref = getNotationPreference();
    for (const t of tracks || []) {
      if (t.keyIndex == null) continue;
      t.key = formatKeyLabel(t.keyIndex, t.keyMode, pref);
    }
    return tracks;
  }

  return {
    enrichTracks,
    reformatTrackKeys,
    formatKeyLabel,
    getNotationPreference,
  };
})();
