//@ts-check
/**
 * Debounced MixAppSession write + unmount flush.
 * @param {() => object} buildSnapshot
 * @param {any[]} deps — values that invalidate the snapshot
 */
function MixAppUseSessionPersist(buildSnapshot, deps) {
  const react = Spicetify.React;
  const persistTimerRef = react.useRef(null);
  const sessionSnapRef = react.useRef(null);

  function writeSession(snapshot) {
    if (!snapshot?.selectedUri) {
      MixAppSession.clear();
      return;
    }
    MixAppSession.save(snapshot);
  }

  function persistSessionSoon() {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps passed explicitly
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
