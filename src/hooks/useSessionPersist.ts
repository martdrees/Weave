/**
 * Debounced WeaveSession write + unmount flush.
 */

import * as WeaveSession from "../state/sessionStore.ts";
import { getReact } from "./reactHost.ts";

export type SessionSnapshot = {
  selectedUri?: string | null;
  playlist?: unknown;
  seedUris?: unknown;
  bannedUris?: unknown;
  searchFeatures?: unknown;
  searchOpen?: boolean;
  statsOpen?: boolean;
  resultsOpen?: boolean;
  searchResults?: unknown;
};

export function useSessionPersist(
  buildSnapshot: () => SessionSnapshot,
  deps: readonly unknown[]
): void {
  const react = getReact();
  const persistTimerRef = react.useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionSnapRef = react.useRef<SessionSnapshot | null>(null);

  function writeSession(snapshot: SessionSnapshot | null): void {
    if (!snapshot?.selectedUri) {
      WeaveSession.clear();
      return;
    }
    WeaveSession.save(snapshot);
  }

  function persistSessionSoon(): void {
    const snapshot = buildSnapshot();
    sessionSnapRef.current = snapshot;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      writeSession(sessionSnapRef.current);
    }, 250);
  }

  // Keep snap current every render so unmount flush never writes a stale/empty session.
  sessionSnapRef.current = buildSnapshot();

  react.useEffect(() => {
    persistSessionSoon();
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
    // deps array is passed explicitly by callers
  }, deps);

  react.useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      writeSession(sessionSnapRef.current);
    };
  }, []);
}
