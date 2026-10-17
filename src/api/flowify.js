//@ts-check
/**
 * Flowify — local playlist rearrange (MixMoose-style curves + sets).
 * Operates only on already-loaded feature vectors; no Spotify calls.
 */

const MixAppFlowify = (() => {
  const FEATURE_IDS = [
    "energy",
    "danceability",
    "valence",
    "acousticness",
    "instrumentalness",
    "speechiness",
    "liveness",
    "loudness",
    "tempo",
  ];

  const CURVE_PRESETS = [
    { id: "peak", label: "Peak in middle" },
    { id: "valley", label: "Valley in middle" },
    { id: "rise", label: "Rise" },
    { id: "fall", label: "Fall" },
    { id: "flat", label: "Flat" },
  ];

  function defaultWeights() {
    const w = {};
    for (const id of FEATURE_IDS) w[id] = 0;
    w.energy = 70;
    w.valence = 20;
    w.tempo = 10;
    return w;
  }

  function defaultOptions() {
    return {
      method: "sets", // sets | curves
      setSize: 4,
      curvePreset: "peak",
      weights: defaultWeights(),
      /** Feature ids whose curve is inverted (anti-correlated). */
      invert: {},
    };
  }

  function metricValue(track, id) {
    if (!track) return null;
    if (id === "tempo") {
      const v = track.tempo ?? track.bpm;
      return v == null || Number.isNaN(Number(v)) ? null : Number(v);
    }
    const v = track[id];
    return v == null || Number.isNaN(Number(v)) ? null : Number(v);
  }

  function activeWeights(weights) {
    const out = [];
    for (const id of FEATURE_IDS) {
      const w = Number(weights?.[id]) || 0;
      if (w > 0) out.push({ id, weight: w / 100 });
    }
    return out;
  }

  /** Per-feature min/max over tracks that have a value. */
  function featureRanges(tracks, ids) {
    const ranges = {};
    for (const id of ids) {
      let min = Infinity;
      let max = -Infinity;
      for (const t of tracks) {
        const v = metricValue(t, id);
        if (v == null) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        ranges[id] = null;
      } else if (max === min) {
        ranges[id] = { min, max, span: 1 };
      } else {
        ranges[id] = { min, max, span: max - min };
      }
    }
    return ranges;
  }

  function normalize(track, id, ranges) {
    const v = metricValue(track, id);
    const r = ranges[id];
    if (v == null || !r) return 0.5;
    return (v - r.min) / r.span;
  }

  function curveAt(preset, t) {
    const x = Math.min(1, Math.max(0, Number(t) || 0));
    switch (preset) {
      case "rise":
        return x;
      case "fall":
        return 1 - x;
      case "valley":
        return 4 * (x - 0.5) * (x - 0.5);
      case "flat":
        return 0.5;
      case "peak":
      default:
        return 1 - 4 * (x - 0.5) * (x - 0.5);
    }
  }

  function targetFor(preset, t, invert) {
    const y = curveAt(preset, t);
    return invert ? 1 - y : y;
  }

  /**
   * Greedy position fill: for each slot, pick remaining track closest to
   * weighted multi-feature curve targets.
   */
  function arrangeByCurves(tracks, opts = {}) {
    const list = Array.isArray(tracks) ? tracks.slice() : [];
    if (list.length < 2) return list;

    const weights = activeWeights(opts.weights);
    if (!weights.length) return list;

    const ids = weights.map((w) => w.id);
    const ranges = featureRanges(list, ids);
    const preset = opts.curvePreset || "peak";
    const invert = opts.invert || {};
    const n = list.length;
    const remaining = list.slice();
    const ordered = [];

    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      let bestIdx = 0;
      let bestCost = Infinity;
      for (let j = 0; j < remaining.length; j++) {
        const track = remaining[j];
        let cost = 0;
        for (const { id, weight } of weights) {
          const actual = normalize(track, id, ranges);
          const want = targetFor(preset, t, !!invert[id]);
          const d = actual - want;
          cost += weight * d * d;
        }
        if (cost < bestCost) {
          bestCost = cost;
          bestIdx = j;
        }
      }
      ordered.push(remaining.splice(bestIdx, 1)[0]);
    }
    return ordered;
  }

  function vectorDistance(a, b, weights, ranges) {
    let sum = 0;
    let wSum = 0;
    for (const { id, weight } of weights) {
      const da = normalize(a, id, ranges);
      const db = normalize(b, id, ranges);
      const d = da - db;
      sum += weight * d * d;
      wSum += weight;
    }
    return wSum > 0 ? sum / wSum : 0;
  }

  function centroidOf(group, weights, ranges) {
    const c = {};
    for (const { id } of weights) {
      let s = 0;
      let n = 0;
      for (const t of group) {
        const v = metricValue(t, id);
        if (v == null) continue;
        s += normalize(t, id, ranges);
        n += 1;
      }
      c[id] = n ? s / n : 0.5;
    }
    return c;
  }

  function centroidDistance(ca, cb, weights) {
    let sum = 0;
    let wSum = 0;
    for (const { id, weight } of weights) {
      const d = (ca[id] ?? 0.5) - (cb[id] ?? 0.5);
      sum += weight * d * d;
      wSum += weight;
    }
    return wSum > 0 ? sum / wSum : 0;
  }

  /** Nearest-neighbor order within a set for smooth transitions. */
  function orderSetSmooth(group, weights, ranges) {
    if (group.length < 2) return group.slice();
    const rem = group.slice();
    // Start with median-energy-ish: track closest to group centroid.
    const center = centroidOf(group, weights, ranges);
    let startIdx = 0;
    let startBest = Infinity;
    for (let i = 0; i < rem.length; i++) {
      let cost = 0;
      for (const { id, weight } of weights) {
        const d = normalize(rem[i], id, ranges) - (center[id] ?? 0.5);
        cost += weight * d * d;
      }
      if (cost < startBest) {
        startBest = cost;
        startIdx = i;
      }
    }
    const ordered = [rem.splice(startIdx, 1)[0]];
    while (rem.length) {
      const last = ordered[ordered.length - 1];
      let bestIdx = 0;
      let best = Infinity;
      for (let i = 0; i < rem.length; i++) {
        const d = vectorDistance(last, rem[i], weights, ranges);
        if (d < best) {
          best = d;
          bestIdx = i;
        }
      }
      ordered.push(rem.splice(bestIdx, 1)[0]);
    }
    return ordered;
  }

  /**
   * Cluster into sets of ~setSize similar tracks, order sets for smooth
   * transitions, order within each set.
   */
  function arrangeBySets(tracks, opts = {}) {
    const list = Array.isArray(tracks) ? tracks.slice() : [];
    if (list.length < 2) return list;

    const weights = activeWeights(opts.weights);
    if (!weights.length) return list;

    const setSize = Math.max(2, Math.min(20, Number(opts.setSize) || 4));
    const ids = weights.map((w) => w.id);
    const ranges = featureRanges(list, ids);

    // Greedy clustering: grow sets from farthest remaining seeds.
    const remaining = list.slice();
    const sets = [];

    while (remaining.length) {
      // Seed = track farthest from last set centroid (or random first).
      let seedIdx = 0;
      if (sets.length) {
        const lastC = centroidOf(sets[sets.length - 1], weights, ranges);
        let best = -1;
        for (let i = 0; i < remaining.length; i++) {
          let cost = 0;
          for (const { id, weight } of weights) {
            const d =
              normalize(remaining[i], id, ranges) - (lastC[id] ?? 0.5);
            cost += weight * d * d;
          }
          if (cost > best) {
            best = cost;
            seedIdx = i;
          }
        }
      }
      const set = [remaining.splice(seedIdx, 1)[0]];
      while (set.length < setSize && remaining.length) {
        const center = centroidOf(set, weights, ranges);
        let bestIdx = 0;
        let best = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          let cost = 0;
          for (const { id, weight } of weights) {
            const d =
              normalize(remaining[i], id, ranges) - (center[id] ?? 0.5);
            cost += weight * d * d;
          }
          if (cost < best) {
            best = cost;
            bestIdx = i;
          }
        }
        set.push(remaining.splice(bestIdx, 1)[0]);
      }
      sets.push(orderSetSmooth(set, weights, ranges));
    }

    // Order sets by nearest-neighbor on centroids.
    if (sets.length > 1) {
      const cents = sets.map((s) => centroidOf(s, weights, ranges));
      const used = new Set([0]);
      const order = [0];
      while (order.length < sets.length) {
        const last = order[order.length - 1];
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < sets.length; i++) {
          if (used.has(i)) continue;
          const d = centroidDistance(cents[last], cents[i], weights);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        used.add(best);
        order.push(best);
      }
      const orderedSets = order.map((i) => sets[i]);
      return orderedSets.flat();
    }

    return sets.flat();
  }

  function arrange(tracks, opts = {}) {
    const options = { ...defaultOptions(), ...opts };
    if (options.method === "curves") {
      return arrangeByCurves(tracks, options);
    }
    return arrangeBySets(tracks, options);
  }

  function featureLabel(id) {
    const m = MixAppFeatures?.METRICS?.find((x) => x.id === id);
    return m?.label || id;
  }

  return {
    FEATURE_IDS,
    CURVE_PRESETS,
    defaultWeights,
    defaultOptions,
    arrange,
    arrangeByCurves,
    arrangeBySets,
    featureLabel,
    activeWeights,
  };
})();
