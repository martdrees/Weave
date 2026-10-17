//@ts-check
/**
 * Audio features via spclient audio-attributes (+ Web API fallback).
 * In-memory cache, track enrichment, relative coloring, aggregates, filters.
 */

const MixAppFeatures = (() => {
  const CACHE = new Map(); // id -> feature sample | null
  const BATCH = 50;
  const SPCLIENT =
    "https://spclient.wg.spotify.com/audio-attributes/v1/audio-features";
  const WEB_FEATURES = "https://api.spotify.com/v1/audio-features";

  const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
  const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

  /** Numeric metrics shown in arranger / stats (0–1 unless noted). */
  const METRICS = [
    { id: "energy", label: "Energy", field: "energy", kind: "01", digits: 2 },
    { id: "danceability", label: "Dance", field: "danceability", kind: "01", digits: 2 },
    { id: "valence", label: "Valence", field: "valence", kind: "01", digits: 2 },
    { id: "acousticness", label: "Acoustic", field: "acousticness", kind: "01", digits: 2 },
    { id: "instrumentalness", label: "Instr.", field: "instrumentalness", kind: "01", digits: 2 },
    { id: "speechiness", label: "Speech", field: "speechiness", kind: "01", digits: 2 },
    { id: "liveness", label: "Live", field: "liveness", kind: "01", digits: 2 },
    { id: "loudness", label: "Loud", field: "loudness", kind: "loudness", digits: 1 },
    { id: "tempo", label: "BPM", field: "tempo", kind: "tempo", digits: 0 },
  ];

  function trackIdFromUri(uri) {
    if (!uri || !String(uri).includes(":track:")) return null;
    return String(uri).split(":").pop() || null;
  }

  function formatCamelot(key, mode) {
    if (key == null || key < 0 || key > 11) return null;
    const n = mode === 0 ? CAMELOT_MINOR[key] : CAMELOT_MAJOR[key];
    return n + (mode === 0 ? "A" : "B");
  }

  /** Spotify-style Camelot wheel hues (1–12), shared by A/B. */
  const CAMELOT_HUES = [
    null,
    0, // 1 red
    28, // 2 orange
    48, // 3 amber
    72, // 4 yellow-green
    120, // 5 green
    160, // 6 teal
    185, // 7 cyan
    210, // 8 blue
    245, // 9 indigo
    275, // 10 violet
    300, // 11 magenta
    330, // 12 pink
  ];

  function camelotNumberFromLabel(label) {
    if (label == null) return null;
    const m = String(label).match(/(\d{1,2})\s*[ABab]/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 1 && n <= 12 ? n : null;
  }

  function camelotNumber(keyIndex, mode, label) {
    if (keyIndex != null && keyIndex >= 0 && keyIndex <= 11 && mode != null) {
      return mode === 0 ? CAMELOT_MINOR[keyIndex] : CAMELOT_MAJOR[keyIndex];
    }
    return camelotNumberFromLabel(label);
  }

  /** Soft colored pill background matching Spotify's Camelot key column. */
  function camelotBackground(keyIndex, mode, label) {
    const n = camelotNumber(keyIndex, mode, label);
    if (!n) return null;
    const hue = CAMELOT_HUES[n];
    if (hue == null) return null;
    return "hsla(" + hue + ", 78%, 46%, 0.55)";
  }

  function getNotationPreference() {
    return { camelot: true, standard: false };
  }

  /** Always Camelot (e.g. 8A) — matches Spotify playlist key column. */
  function formatKeyLabel(key, mode) {
    return formatCamelot(key, mode);
  }

  /**
   * Mix In Key / Camelot relative moves from a seed key.
   * Enabled moves are OR'd: a candidate matches if any seed reaches it via any move.
   */
  const CAMELOT_MOVES = [
    {
      id: "same",
      label: "Harmonic",
      hint: "Stay in the harmonic (exact key)",
      example: "8A → 8A",
    },
    {
      id: "plus1",
      label: "More Energie",
      hint: "Number +1 · more energy",
      example: "7A → 8A",
    },
    {
      id: "minus1",
      label: "Less Energie",
      hint: "Number −1 · less energy",
      example: "7A → 6A",
    },
    {
      id: "brighter",
      label: "Brighter Mood",
      hint: "Letter → B · minor → major",
      example: "7A → 7B",
    },
    {
      id: "darker",
      label: "Darker Mood",
      hint: "Letter → A · major → minor",
      example: "7B → 7A",
    },
    {
      id: "plus2",
      label: "Energie Boost",
      hint: "Jump +2 · energy boost",
      example: "8A → 10A",
    },
    {
      id: "diagonal",
      label: "Mood Shift",
      hint: "Diagonal (±1 + letter flip)",
      example: "8A → 9B / 7B",
    },
    {
      id: "jaws",
      label: "Harmonic Shift",
      hint: "Jaws (±5) · dramatic harmonic drop/shift",
      example: "8A → 3A",
    },
  ];

  function wrapCamelotNum(n) {
    return ((((Number(n) - 1) % 12) + 12) % 12) + 1;
  }

  function parseCamelot(trackOrLabel) {
    if (trackOrLabel == null) return null;
    if (typeof trackOrLabel === "object") {
      const fromIdx = formatCamelot(trackOrLabel.keyIndex, trackOrLabel.keyMode);
      if (fromIdx) {
        const m = fromIdx.match(/^(\d{1,2})([AB])$/i);
        if (m) {
          return {
            n: parseInt(m[1], 10),
            letter: m[2].toUpperCase(),
            label: m[1] + m[2].toUpperCase(),
          };
        }
      }
      trackOrLabel = trackOrLabel.key;
    }
    const m = String(trackOrLabel).match(/(\d{1,2})\s*([ABab])/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (n < 1 || n > 12) return null;
    const letter = m[2].toUpperCase();
    return { n, letter, label: n + letter };
  }

  function targetsForMove(seed, moveId) {
    if (!seed) return [];
    const n = seed.n;
    const L = seed.letter;
    const flip = L === "A" ? "B" : "A";
    switch (moveId) {
      case "same":
        return [n + L];
      case "plus1":
        return [wrapCamelotNum(n + 1) + L];
      case "minus1":
        return [wrapCamelotNum(n - 1) + L];
      case "brighter":
        // Minor → relative major (brighter). Only from A seeds.
        return L === "A" ? [n + "B"] : [];
      case "darker":
        // Major → relative minor (darker). Only from B seeds.
        return L === "B" ? [n + "A"] : [];
      case "plus2":
        return [wrapCamelotNum(n + 2) + L];
      case "diagonal":
        return [
          wrapCamelotNum(n + 1) + flip,
          wrapCamelotNum(n - 1) + flip,
        ];
      case "jaws":
        return [
          wrapCamelotNum(n + 5) + L,
          wrapCamelotNum(n - 5) + L,
        ];
      default:
        return [];
    }
  }

  /** Build the set of Camelot labels allowed by seeds × selected moves. */
  function camelotAllowedLabels(seedTracksOrKeys, moveIds) {
    const moves = (moveIds || []).filter(Boolean);
    if (!moves.length) return null;
    const allowed = new Set();
    for (const seedSrc of seedTracksOrKeys || []) {
      const seed = parseCamelot(seedSrc);
      if (!seed) continue;
      for (const moveId of moves) {
        for (const label of targetsForMove(seed, moveId)) {
          allowed.add(label);
        }
      }
    }
    return allowed;
  }

  function filterTracksByCamelotMoves(tracks, seedTracks, moveIds) {
    const allowed = camelotAllowedLabels(seedTracks, moveIds);
    if (!allowed) return tracks || [];
    if (!allowed.size) return [];
    return (tracks || []).filter((t) => {
      const key = parseCamelot(t);
      return !!(key && allowed.has(key.label));
    });
  }

  function pickSample(feat) {
    if (!feat || typeof feat !== "object") return null;
    return {
      key: feat.key,
      mode: feat.mode,
      tempo: feat.tempo,
      acousticness: feat.acousticness,
      danceability: feat.danceability,
      energy: feat.energy,
      instrumentalness: feat.instrumentalness,
      liveness: feat.liveness,
      loudness: feat.loudness,
      speechiness: feat.speechiness,
      valence: feat.valence,
      popularity: feat.popularity,
      time_signature: feat.time_signature ?? feat.timeSignature,
      duration_ms: feat.duration_ms ?? feat.durationMs,
    };
  }

  async function fetchBatch(ids) {
    if (!ids.length) return;
    const missing = ids.filter((id) => !CACHE.has(id));
    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH);
      let list = null;

      try {
        const getter =
          MixAppApi?.withRetry ||
          ((fn) => fn());
        const res = await getter(
          () =>
            Spicetify.CosmosAsync.get(
              SPCLIENT + "?ids=" + chunk.join(",")
            ),
          { retries: 4, label: "audio-attributes", notifyUser: false }
        );
        list = res?.audio_features || res?.audioFeatures || null;
      } catch (err) {
        console.warn("MixApp: audio-attributes batch failed", err);
      }

      if (!list) {
        try {
          const getter =
            MixAppApi?.withRetry ||
            ((fn) => fn());
          const res = await getter(
            () =>
              Spicetify.CosmosAsync.get(
                WEB_FEATURES + "?ids=" + chunk.join(",")
              ),
            { retries: 4, label: "audio-features", notifyUser: false }
          );
          list = res?.audio_features || null;
        } catch (err) {
          console.warn("MixApp: /v1/audio-features batch failed", err);
        }
      }

      for (let j = 0; j < chunk.length; j++) {
        const sample = pickSample(list?.[j]);
        if (sample && (typeof sample.key === "number" || sample.energy != null)) {
          CACHE.set(chunk[j], sample);
        } else {
          CACHE.set(chunk[j], null);
        }
      }
    }
  }

  async function getFeatureSamples(ids) {
    const unique = [...new Set((ids || []).filter(Boolean))];
    await fetchBatch(unique);
    return unique.map((id) => CACHE.get(id)).filter(Boolean);
  }

  async function getFeatureSampleMap(ids) {
    const unique = [...new Set((ids || []).filter(Boolean))];
    await fetchBatch(unique);
    const map = new Map();
    for (const id of unique) {
      const sample = CACHE.get(id);
      if (sample) map.set(id, sample);
    }
    return map;
  }

  function cacheSize() {
    return CACHE.size;
  }

  /**
   * Enrich track objects with key/BPM + full feature fields.
   * Mutates and returns the same array reference.
   */
  async function enrichTracks(tracks) {
    if (!tracks?.length) return tracks;
    const ids = [];
    for (const t of tracks) {
      const id = t.id || trackIdFromUri(t.uri);
      if (id) ids.push(id);
    }
    await fetchBatch([...new Set(ids)]);
    for (const t of tracks) {
      const id = t.id || trackIdFromUri(t.uri);
      const feat = id ? CACHE.get(id) : null;
      if (!feat) {
        if (t.bpm == null) t.bpm = null;
        if (t.key == null) t.key = null;
        t.featuresLoaded = false;
        continue;
      }
      t.featuresLoaded = true;
      t.keyIndex = feat.key;
      t.keyMode = feat.mode;
      t.energy = feat.energy;
      t.danceability = feat.danceability;
      t.valence = feat.valence;
      t.acousticness = feat.acousticness;
      t.instrumentalness = feat.instrumentalness;
      t.speechiness = feat.speechiness;
      t.liveness = feat.liveness;
      t.loudness = feat.loudness;
      t.tempo = feat.tempo;
      t.popularity = feat.popularity ?? t.popularity;
      t.bpm =
        feat.tempo != null && !Number.isNaN(feat.tempo)
          ? Math.round(feat.tempo)
          : t.bpm ?? null;
      t.key = formatKeyLabel(feat.key, feat.mode);
    }
    return tracks;
  }

  function reformatTrackKeys(tracks) {
    for (const t of tracks || []) {
      if (t.keyIndex == null) continue;
      t.key = formatKeyLabel(t.keyIndex, t.keyMode);
    }
    return tracks;
  }

  function formatMetric(metric, value) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    const n = Number(value);
    if (metric.kind === "tempo") return String(Math.round(n));
    if (metric.kind === "loudness") return n.toFixed(1);
    return n.toFixed(metric.digits ?? 2);
  }

  function metricValue(track, metric) {
    if (!track || !metric) return null;
    if (metric.field === "tempo") {
      const v = track.tempo ?? track.bpm;
      return v == null || v === "" ? null : Number(v);
    }
    const v = track[metric.field];
    return v == null || Number.isNaN(Number(v)) ? null : Number(v);
  }

  /** Normalize value to 0–1 within playlist min/max for relative coloring. */
  function relativeNorm(value, min, max) {
    if (value == null || min == null || max == null) return null;
    if (max === min) return 0.5;
    return Math.min(1, Math.max(0, (value - min) / (max - min)));
  }

  /** Heat color: low = cool blue, mid = green, high = amber. */
  function relativeColor(norm) {
    if (norm == null) return null;
    const t = Math.min(1, Math.max(0, norm));
    let r;
    let g;
    let b;
    if (t < 0.5) {
      const u = t * 2;
      r = Math.round(60 + u * 20);
      g = Math.round(100 + u * 100);
      b = Math.round(180 - u * 80);
    } else {
      const u = (t - 0.5) * 2;
      r = Math.round(80 + u * 140);
      g = Math.round(200 - u * 40);
      b = Math.round(100 - u * 60);
    }
    return "rgba(" + r + "," + g + "," + b + ",0.35)";
  }

  function rangeForMetric(tracks, metric) {
    let min = Infinity;
    let max = -Infinity;
    let count = 0;
    for (const t of tracks || []) {
      const v = metricValue(t, metric);
      if (v == null) continue;
      count += 1;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!count) return { min: null, max: null, count: 0 };
    return { min, max, count };
  }

  /**
   * BPM “compatibility distance” in 0…1.
   * Near tempos and double/half-time count as close (MixMoose-style).
   */
  function bpmCompatDistance(a, b) {
    if (a == null || b == null) return null;
    const x = Number(a);
    const y = Number(b);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) {
      return null;
    }
    const r = Math.max(x, y) / Math.min(x, y);
    const d = Math.min(Math.abs(r - 1), Math.abs(r - 2), Math.abs(r - 0.5));
    return Math.min(1, d);
  }

  function camelotLetter(track) {
    if (track?.keyMode === 0) return "A";
    if (track?.keyMode === 1) return "B";
    const parsed = parseCamelot(track);
    if (parsed?.letter) return String(parsed.letter).toUpperCase();
    const m = String(track?.key || "").match(/[ABab]/);
    return m ? m[0].toUpperCase() : null;
  }

  /**
   * Camelot / Open Key distance in 0…1 (0 = same / highly compatible).
   */
  function keyCompatDistance(a, b) {
    const na = camelotNumber(a?.keyIndex, a?.keyMode, a?.key);
    const nb = camelotNumber(b?.keyIndex, b?.keyMode, b?.key);
    if (na == null || nb == null) return null;
    const la = camelotLetter(a);
    const lb = camelotLetter(b);
    const wheel = Math.min(Math.abs(na - nb), 12 - Math.abs(na - nb)); // 0…6
    if (la && lb && la !== lb) {
      if (wheel === 0) return 1 / 6; // relative major/minor
      return Math.min(1, (wheel + 1) / 6);
    }
    return wheel / 6;
  }

  const AGG_CHANGE_01_FIELDS = [
    "energy",
    "danceability",
    "valence",
    "acousticness",
    "instrumentalness",
    "speechiness",
    "liveness",
  ];

  /**
   * Absolute Aggregate Change per track (transition into that track).
   * Track 0 has no prior → null. Values are 0…100 (%).
   */
  function absoluteAggregateChange(tracks) {
    const list = Array.isArray(tracks) ? tracks : [];
    const values = [];
    for (let i = 0; i < list.length; i++) {
      if (i === 0) {
        values.push(null);
        continue;
      }
      const prev = list[i - 1];
      const cur = list[i];
      const parts = [];
      for (const field of AGG_CHANGE_01_FIELDS) {
        const a = prev?.[field];
        const b = cur?.[field];
        if (a == null || b == null || Number.isNaN(Number(a)) || Number.isNaN(Number(b))) {
          continue;
        }
        parts.push(Math.abs(Number(a) - Number(b)));
      }
      const bpmA = prev?.tempo ?? prev?.bpm;
      const bpmB = cur?.tempo ?? cur?.bpm;
      const bpmD = bpmCompatDistance(bpmA, bpmB);
      if (bpmD != null) parts.push(bpmD);
      const keyD = keyCompatDistance(prev, cur);
      if (keyD != null) parts.push(keyD);

      if (!parts.length) {
        values.push(null);
        continue;
      }
      const mean = parts.reduce((s, v) => s + v, 0) / parts.length;
      values.push(Math.min(100, Math.max(0, mean * 100)));
    }

    const known = values.filter((v) => v != null);
    let avg = null;
    let min = null;
    let max = null;
    if (known.length) {
      avg = known.reduce((s, v) => s + v, 0) / known.length;
      min = Math.min(...known);
      max = Math.max(...known);
    }
    return {
      id: "aggChange",
      label: "Abs. Aggregate",
      kind: "percent",
      values,
      count: known.length,
      avg,
      min,
      max,
      /** 100% = perfectly smooth transitions. */
      smoothness: avg == null ? null : Math.max(0, 100 - avg),
    };
  }

  function aggregateStats(tracks) {
    const stats = {};
    for (const metric of METRICS) {
      const values = [];
      for (const t of tracks || []) {
        const v = metricValue(t, metric);
        if (v != null) values.push(v);
      }
      if (!values.length) {
        stats[metric.id] = { count: 0, min: null, max: null, avg: null };
        continue;
      }
      const sum = values.reduce((a, b) => a + b, 0);
      stats[metric.id] = {
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: sum / values.length,
        values,
      };
    }

    const keyCounts = {};
    for (const t of tracks || []) {
      const k = t.key || "—";
      keyCounts[k] = (keyCounts[k] || 0) + 1;
    }
    const topKeys = Object.entries(keyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, count]) => ({ key, count }));

    return { metrics: stats, topKeys, trackCount: (tracks || []).length };
  }

  /** Histogram bins (0–1 normalized into `bins` buckets for charting). */
  function histogram(values, bins = 10, kind = "01") {
    const out = Array.from({ length: bins }, () => 0);
    if (!values?.length) return out;
    let min = 0;
    let max = 1;
    if (kind === "tempo") {
      min = 40;
      max = 220;
    } else if (kind === "loudness") {
      min = -60;
      max = 0;
    }
    for (const v of values) {
      const n = (v - min) / (max - min);
      let i = Math.floor(n * bins);
      if (i < 0) i = 0;
      if (i >= bins) i = bins - 1;
      out[i] += 1;
    }
    return out;
  }

  function defaultArrangerFilters() {
    return {
      query: "",
      bpmMin: "",
      bpmMax: "",
      energyMin: "",
      energyMax: "",
      valenceMin: "",
      valenceMax: "",
      keyQuery: "",
    };
  }

  function filtersActive(filters) {
    if (!filters) return false;
    return !!(
      filters.query ||
      filters.bpmMin !== "" ||
      filters.bpmMax !== "" ||
      filters.energyMin !== "" ||
      filters.energyMax !== "" ||
      filters.valenceMin !== "" ||
      filters.valenceMax !== "" ||
      filters.keyQuery
    );
  }

  function filterTracks(tracks, filters) {
    if (!filtersActive(filters)) return tracks || [];
    const q = String(filters.query || "")
      .trim()
      .toLowerCase();
    const keyQ = String(filters.keyQuery || "")
      .trim()
      .toLowerCase();
    const bpmMin =
      filters.bpmMin === "" ? null : parseFloat(filters.bpmMin);
    const bpmMax =
      filters.bpmMax === "" ? null : parseFloat(filters.bpmMax);
    const energyMin =
      filters.energyMin === "" ? null : parseFloat(filters.energyMin);
    const energyMax =
      filters.energyMax === "" ? null : parseFloat(filters.energyMax);
    const valenceMin =
      filters.valenceMin === "" ? null : parseFloat(filters.valenceMin);
    const valenceMax =
      filters.valenceMax === "" ? null : parseFloat(filters.valenceMax);

    return (tracks || []).filter((t) => {
      if (q) {
        const hay = (
          (t.name || "") +
          " " +
          (t.artists || "") +
          " " +
          (t.album || "")
        ).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (keyQ) {
        if (!String(t.key || "")
          .toLowerCase()
          .includes(keyQ))
          return false;
      }
      const bpm = t.bpm != null ? Number(t.bpm) : null;
      if (bpmMin != null && Number.isFinite(bpmMin) && (bpm == null || bpm < bpmMin))
        return false;
      if (bpmMax != null && Number.isFinite(bpmMax) && (bpm == null || bpm > bpmMax))
        return false;
      const energy = t.energy != null ? Number(t.energy) : null;
      if (
        energyMin != null &&
        Number.isFinite(energyMin) &&
        (energy == null || energy < energyMin)
      )
        return false;
      if (
        energyMax != null &&
        Number.isFinite(energyMax) &&
        (energy == null || energy > energyMax)
      )
        return false;
      const valence = t.valence != null ? Number(t.valence) : null;
      if (
        valenceMin != null &&
        Number.isFinite(valenceMin) &&
        (valence == null || valence < valenceMin)
      )
        return false;
      if (
        valenceMax != null &&
        Number.isFinite(valenceMax) &&
        (valence == null || valence > valenceMax)
      )
        return false;
      return true;
    });
  }

  function sortTracks(tracks, sortKey, direction) {
    if (!sortKey || !direction) return (tracks || []).slice();
    const dir = direction === "desc" ? -1 : 1;
    const metric = METRICS.find((m) => m.id === sortKey || m.field === sortKey);
    const list = (tracks || []).slice();
    // Original playlist order for “#” sorting
    const order = new Map();
    (tracks || []).forEach((t, i) => {
      order.set(t.uid || t.uri || i, i);
    });
    list.sort((a, b) => {
      let av;
      let bv;
      if (sortKey === "index" || sortKey === "INDEX" || sortKey === "#") {
        av = order.get(a.uid || a.uri) ?? 0;
        bv = order.get(b.uid || b.uri) ?? 0;
        return (av - bv) * dir;
      }
      if (sortKey === "name") {
        av = a.name || "";
        bv = b.name || "";
        return av.localeCompare(bv) * dir;
      }
      if (sortKey === "artists") {
        av = a.artists || "";
        bv = b.artists || "";
        return av.localeCompare(bv) * dir;
      }
      if (sortKey === "album") {
        av = a.album || "";
        bv = b.album || "";
        return av.localeCompare(bv) * dir;
      }
      if (sortKey === "key") {
        av = a.key || "";
        bv = b.key || "";
        return av.localeCompare(bv) * dir;
      }
      if (sortKey === "duration" || sortKey === "DURATION") {
        av = a.durationMs ?? 0;
        bv = b.durationMs ?? 0;
        return (av - bv) * dir;
      }
      if (sortKey === "BPM" || sortKey === "bpm" || sortKey === "tempo") {
        av = a.bpm ?? a.tempo;
        bv = b.bpm ?? b.tempo;
      } else if (metric) {
        av = metricValue(a, metric);
        bv = metricValue(b, metric);
      } else {
        av = a[sortKey];
        bv = b[sortKey];
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return av.localeCompare(String(bv)) * dir;
      return (Number(av) - Number(bv)) * dir;
    });
    return list;
  }

  return {
    METRICS,
    CAMELOT_MOVES,
    enrichTracks,
    reformatTrackKeys,
    formatKeyLabel,
    formatCamelot,
    parseCamelot,
    camelotBackground,
    camelotNumber,
    camelotAllowedLabels,
    filterTracksByCamelotMoves,
    getNotationPreference,
    getFeatureSamples,
    getFeatureSampleMap,
    trackIdFromUri,
    cacheSize,
    formatMetric,
    metricValue,
    relativeNorm,
    relativeColor,
    rangeForMetric,
    aggregateStats,
    absoluteAggregateChange,
    bpmCompatDistance,
    keyCompatDistance,
    histogram,
    defaultArrangerFilters,
    filtersActive,
    filterTracks,
    sortTracks,
  };
})();
