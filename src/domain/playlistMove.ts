/**
 * Pure helpers for one-row playlist move positioning (mutation port).
 */

export type LivePlaylistItem = { uri: string; uid: string };

export type MovePositionInput = {
  after?: string;
  before?: string;
  index?: number;
};

export type ResolvedMove = {
  from: number;
  to: number;
  after?: string;
  before?: string;
};

/**
 * Resolve after / before / index into Platform move opts + from/to for Web API reorder.
 * `after` / `before` values are Spotify item uids, or `after: "end"`.
 * `index` is the desired final 0-based index in the playlist after the move.
 */
export function resolveMovePosition(
  live: LivePlaylistItem[],
  movingUid: string,
  position: MovePositionInput
): ResolvedMove {
  const items = Array.isArray(live) ? live : [];
  const from = items.findIndex((l) => l && String(l.uid) === String(movingUid));
  if (from < 0) {
    throw new Error("moveTrack: item uid not found in playlist");
  }

  const pos = position || {};
  const hasAfter = pos.after != null && String(pos.after) !== "";
  const hasBefore = pos.before != null && String(pos.before) !== "";
  const hasIndex = typeof pos.index === "number" && Number.isFinite(pos.index);

  const modeCount = [hasAfter, hasBefore, hasIndex].filter(Boolean).length;
  if (modeCount !== 1) {
    throw new Error("moveTrack: provide exactly one of after, before, or index");
  }

  if (hasAfter) {
    if (pos.after === "end") {
      return { from, to: items.length - 1, after: "end" };
    }
    const afterUid = String(pos.after);
    if (afterUid === String(movingUid)) {
      throw new Error("moveTrack: cannot move after itself");
    }
    const anchorIdx = items.findIndex((l) => String(l.uid) === afterUid);
    if (anchorIdx < 0) {
      throw new Error("moveTrack: after uid not found");
    }
    const to = from < anchorIdx ? anchorIdx : anchorIdx + 1;
    return { from, to, after: afterUid };
  }

  if (hasBefore) {
    const beforeUid = String(pos.before);
    if (beforeUid === String(movingUid)) {
      throw new Error("moveTrack: cannot move before itself");
    }
    const anchorIdx = items.findIndex((l) => String(l.uid) === beforeUid);
    if (anchorIdx < 0) {
      throw new Error("moveTrack: before uid not found");
    }
    let to = from < anchorIdx ? anchorIdx - 1 : anchorIdx;
    if (to < 0) to = 0;
    return { from, to, before: beforeUid };
  }

  const without = items.filter((_, i) => i !== from);
  const to = Math.max(0, Math.min(Math.floor(pos.index as number), items.length - 1));
  const insertAt = Math.max(0, Math.min(to, without.length));
  const resolved: ResolvedMove = { from, to };
  if (insertAt >= without.length) {
    resolved.after = "end";
  } else if (insertAt === 0) {
    resolved.before = String(without[0].uid);
  } else {
    resolved.after = String(without[insertAt - 1].uid);
  }
  return resolved;
}
