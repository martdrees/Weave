/**
 * Async generation tokens — ignore stale completions.
 * Used by recommend search and Fit-to-seeds (ADR 006).
 */

export function nextGen(ref: { current: number }): number {
  ref.current += 1;
  return ref.current;
}

export function isCurrentGen(gen: number, ref: { current: number }): boolean {
  return gen === ref.current;
}
