/**
 * Pure Camelot / key helpers (no I/O).
 * Split from legacy api/features.js per ADR 005.
 */

export const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1] as const;
export const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10] as const;

/** Spotify-style Camelot wheel hues (1–12), shared by A/B. */
export const CAMELOT_HUES = [
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
] as const;

export const STANDARD_PITCH = [
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
] as const;

/**
 * Web API / spclient v1: 0 = minor, 1 = major.
 * Accept string flags; do not treat AudioAttributesV2 enum (1=minor, 2=major) here.
 */
export function normalizeMode(mode: unknown): 0 | 1 | null {
  if (mode === 0 || mode === "0" || mode === false || mode === "minor") return 0;
  if (mode === 1 || mode === "1" || mode === true || mode === "major") return 1;
  if (mode == null || mode === "") return null;
  return Number(mode) === 0 ? 0 : 1;
}

export function formatCamelot(key: unknown, mode: unknown): string | null {
  const k = typeof key === "number" ? key : Number(key);
  if (key == null || k < 0 || k > 11) return null;
  const m = normalizeMode(mode);
  if (m == null) return null;
  const n = m === 0 ? CAMELOT_MINOR[k] : CAMELOT_MAJOR[k];
  return n + (m === 0 ? "A" : "B");
}

export type CamelotParsed = { n: number; letter: string; label: string };

export function parseCamelot(
  trackOrLabel:
    | string
    | {
        key?: string | null;
        keyIndex?: number | null;
        keyMode?: number | null;
      }
    | null
    | undefined
): CamelotParsed | null {
  if (trackOrLabel == null) return null;
  if (typeof trackOrLabel === "object") {
    if (trackOrLabel.key != null && trackOrLabel.key !== "") {
      const fromLabel = parseCamelot(String(trackOrLabel.key));
      if (fromLabel) return fromLabel;
    }
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
    return null;
  }
  const m = String(trackOrLabel).match(/(\d{1,2})\s*([ABab])/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > 12) return null;
  const letter = m[2].toUpperCase();
  return { n, letter, label: n + letter };
}

/** Reverse Camelot label → pitch-class + Web API mode for filters/sort. */
export function indexModeFromCamelotLabel(
  label: string | null | undefined
): { key: number; mode: 0 | 1 } | null {
  const parsed = parseCamelot(label);
  if (!parsed) return null;
  const table = parsed.letter === "A" ? CAMELOT_MINOR : CAMELOT_MAJOR;
  const mode: 0 | 1 = parsed.letter === "A" ? 0 : 1;
  for (let k = 0; k < 12; k++) {
    if (table[k] === parsed.n) return { key: k, mode };
  }
  return null;
}

export function looksLikeCamelotLabel(label: unknown): boolean {
  return !!String(label || "").match(/^\d{1,2}\s*[ABab]$/);
}

export function camelotNumberFromLabel(label: unknown): number | null {
  if (label == null) return null;
  const m = String(label).match(/(\d{1,2})\s*[ABab]/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 12 ? n : null;
}

export function camelotNumber(
  keyIndex: number | null | undefined,
  mode: unknown,
  label?: string | null
): number | null {
  const fromLabel = camelotNumberFromLabel(label);
  if (fromLabel != null) return fromLabel;
  if (keyIndex != null && keyIndex >= 0 && keyIndex <= 11 && mode != null) {
    const m = normalizeMode(mode);
    if (m == null) return null;
    return m === 0 ? CAMELOT_MINOR[keyIndex] : CAMELOT_MAJOR[keyIndex];
  }
  return null;
}

/** Soft pill from Spotify's camelotKey.color, else our Camelot wheel hues. */
export function camelotBackground(
  keyIndex: number | null | undefined,
  mode: unknown,
  label?: string | null,
  keyColor?: string | null
): string | null {
  if (keyColor) {
    const c = String(keyColor).trim();
    if (c) return c;
  }
  const n = camelotNumber(keyIndex, mode, label);
  if (!n) return null;
  const hue = CAMELOT_HUES[n];
  if (hue == null) return null;
  return "hsla(" + hue + ", 78%, 46%, 0.55)";
}

/** Format standard key like Spotify: F♯ / Am (♯/♭, minor → trailing m). */
export function formatStandardKey(
  standardKey: string | null | undefined,
  mode: unknown
): string | null {
  if (standardKey == null || standardKey === "") return null;
  let s = String(standardKey).replace(/#/g, "♯").replace(/b/g, "♭").replace(/m$/i, "");
  if (!s) return null;
  const minor =
    mode === "minor" ||
    mode === 0 ||
    mode === "0" ||
    (typeof mode === "string" && /minor/i.test(mode));
  return minor ? s + "m" : s;
}

export function standardFromPitchMode(
  keyIndex: number | null | undefined,
  mode: unknown
): string | null {
  if (keyIndex == null || keyIndex < 0 || keyIndex > 11) return null;
  const m = normalizeMode(mode);
  if (m == null) return null;
  return STANDARD_PITCH[keyIndex] + (m === 0 ? "m" : "");
}

/** Camelot label for storage / filters (not display). */
export function formatKeyLabel(key: unknown, mode: unknown): string | null {
  return formatCamelot(key, mode);
}

export function wrapCamelotNum(n: number): number {
  return ((((Number(n) - 1) % 12) + 12) % 12) + 1;
}

/**
 * Mix In Key / Camelot relative moves from a seed key.
 * Enabled moves are OR'd: a candidate matches if any seed reaches it via any move.
 */
export const CAMELOT_MOVES = [
  {
    id: "same",
    label: "Harmonic",
    hint: "Stay in the harmonic (exact key)",
    example: "8A → 8A",
  },
  {
    id: "plus1",
    label: "More Energy",
    hint: "Number +1 · more energy",
    example: "7A → 8A",
  },
  {
    id: "minus1",
    label: "Less Energy",
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
    label: "Energy Boost",
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
] as const;

export function targetsForMove(seed: CamelotParsed, moveId: string): string[] {
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
      return L === "A" ? [n + "B"] : [];
    case "darker":
      return L === "B" ? [n + "A"] : [];
    case "plus2":
      return [wrapCamelotNum(n + 2) + L];
    case "diagonal":
      return [wrapCamelotNum(n + 1) + flip, wrapCamelotNum(n - 1) + flip];
    case "jaws":
      return [wrapCamelotNum(n + 5) + L, wrapCamelotNum(n - 5) + L];
    default:
      return [];
  }
}

/** Build the set of Camelot labels allowed by seeds × selected moves. */
export function camelotAllowedLabels(
  seedTracksOrKeys: unknown[],
  moveIds: string[] | null | undefined
): Set<string> | null {
  const moves = (moveIds || []).filter(Boolean);
  if (!moves.length) return null;
  const allowed = new Set<string>();
  for (const seedSrc of seedTracksOrKeys || []) {
    const seed = parseCamelot(
      seedSrc as string | { key?: string; keyIndex?: number; keyMode?: number }
    );
    if (!seed) continue;
    for (const moveId of moves) {
      for (const label of targetsForMove(seed, moveId)) {
        allowed.add(label);
      }
    }
  }
  return allowed;
}

export function filterTracksByCamelotMoves<T>(
  tracks: T[] | null | undefined,
  seedTracks: unknown[],
  moveIds: string[] | null | undefined
): T[] {
  const allowed = camelotAllowedLabels(seedTracks, moveIds);
  if (!allowed) return tracks || [];
  if (!allowed.size) {
    console.warn(
      "Weave: Mix in Key is on but seed has no Camelot key — skipping key filter"
    );
    return tracks || [];
  }
  return (tracks || []).filter((t) => {
    const key = parseCamelot(
      t as string | { key?: string; keyIndex?: number; keyMode?: number }
    );
    return !!(key && allowed.has(key.label));
  });
}

function camelotLetter(
  track: {
    keyMode?: number | null;
    key?: string | null;
  } | null
): string | null {
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
export function keyCompatDistance(
  a: { keyIndex?: number | null; keyMode?: number | null; key?: string | null } | null,
  b: { keyIndex?: number | null; keyMode?: number | null; key?: string | null } | null
): number | null {
  const na = camelotNumber(a?.keyIndex, a?.keyMode, a?.key);
  const nb = camelotNumber(b?.keyIndex, b?.keyMode, b?.key);
  if (na == null || nb == null) return null;
  const la = camelotLetter(a);
  const lb = camelotLetter(b);
  const wheel = Math.min(Math.abs(na - nb), 12 - Math.abs(na - nb));
  if (la && lb && la !== lb) {
    if (wheel === 0) return 1 / 6;
    return Math.min(1, (wheel + 1) / 6);
  }
  return wheel / 6;
}
