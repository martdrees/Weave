/**
 * Spicetify.React hosts for Creator hooks.
 *
 * Prefer `getReact()` with explicit generics. Large mechanical ports
 * (playlist session / recommend / playback / shortcuts) use `getReactLoose()`
 * until Phase 4 option/row types stabilize — avoids scattered `React as any`.
 */

export type WeaveReact = {
  useState: <T>(init: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useRef: <T>(init: T) => { current: T };
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
};

export function getReact(): WeaveReact {
  return Spicetify.React as unknown as WeaveReact;
}

/**
 * Named escape hatch for large mechanical ports.
 * Returns the live Spicetify.React object without inventing row/option generics.
 */
export function getReactLoose(): any {
  return Spicetify.React;
}
