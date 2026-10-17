//@ts-check
/**
 * Global keydown map + Esc overlay stack.
 *
 * @param {{
 *   closeTopOverlay: () => boolean,
 *   saving: boolean,
 *   playlist: object|null,
 *   tracks: object[],
 *   handleSave: () => void,
 *   handleSaveAsNew: () => void,
 *   handleUndo: () => void,
 *   handleRedo: () => void,
 *   handleToggleSearch: () => void,
 *   openPanel: (id: string) => void,
 *   togglePanel: (id: string) => void,
 * }} handlers
 */
function MixAppUseAppShortcuts(handlers) {
  const react = Spicetify.React;
  const handlersRef = react.useRef(handlers);
  handlersRef.current = handlers;

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = String(el.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    return !!el.closest?.("input, textarea, select, [contenteditable=true]");
  }

  react.useEffect(() => {
    function onKey(e) {
      const h = handlersRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const typing = isTypingTarget(e.target);

      if (e.key === "Escape") {
        if (h.closeTopOverlay()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (!mod && !typing && (e.key === "?" || (e.key === "/" && e.shiftKey))) {
        e.preventDefault();
        h.togglePanel("shortcuts");
        return;
      }

      if (!mod) return;

      const key = String(e.key || "").toLowerCase();

      if (key === "s" && !e.shiftKey) {
        e.preventDefault();
        if (!h.saving) h.handleSave();
        return;
      }
      if (key === "s" && e.shiftKey) {
        e.preventDefault();
        if (!h.saving) h.handleSaveAsNew();
        return;
      }

      if (typing) return;

      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        h.handleUndo();
        return;
      }
      if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        h.handleRedo();
        return;
      }
      if (key === "f" && !e.shiftKey) {
        e.preventDefault();
        h.handleToggleSearch();
        return;
      }
      if (key === "a" && e.shiftKey) {
        e.preventDefault();
        if (h.playlist) h.openPanel("addTrack");
        return;
      }
      if (key === "c" && e.shiftKey) {
        e.preventDefault();
        if (h.playlist) h.openPanel("copyPlaylist");
        return;
      }
      if (key === "f" && e.shiftKey) {
        e.preventDefault();
        if (h.playlist && h.tracks.length) h.openPanel("flowify");
        return;
      }
      if (key === "g" && e.shiftKey) {
        e.preventDefault();
        if (h.playlist && h.tracks.length) h.openPanel("generator");
        return;
      }
      if (key === "t" && e.shiftKey) {
        e.preventDefault();
        h.togglePanel("stats");
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
