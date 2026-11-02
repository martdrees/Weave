//@ts-check
/**
 * Global shortcut map + Esc overlay stack.
 *
 * Letter chords follow the **active OS keyboard layout**:
 * `navigator.keyboard.getLayoutMap()` maps `e.code` → character. That stays
 * correct under Ctrl/Shift (where `e.key` is often Unidentified / a control
 * char inside Spotify). Falls back to Latin `e.key`, then to physical `Key*`.
 *
 * Capture listeners on window/document beat the Spotify shell; Spicetify.Keyboard
 * is an optional extra binding path when available.
 *
 * @param {{
 *   closeTopOverlay: () => boolean,
 *   saving: boolean,
 *   playlist: object|null,
 *   tracks: object[],
 *   handleSaveAsNew: () => void,
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
    /** @type {Array<() => void>} */
    const cleanups = [];
    let lastFireAt = 0;
    /** @type {KeyboardLayoutMap|null} */
    let layoutMap = null;

    function run(fn) {
      const now = Date.now();
      if (now - lastFireAt < 80) return;
      lastFireAt = now;
      try {
        fn(handlersRef.current);
      } catch (err) {
        console.warn("Weave: shortcut handler failed", err);
      }
    }

    /**
     * @param {KeyboardEvent} e
     * @param {() => void} [action]
     */
    function claim(e, action) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation();
      }
      if (action) action();
    }

    async function refreshLayoutMap() {
      try {
        const kb = navigator.keyboard;
        if (kb && typeof kb.getLayoutMap === "function") {
          layoutMap = await kb.getLayoutMap();
        }
      } catch (_) {
        layoutMap = null;
      }
    }
    void refreshLayoutMap();
    try {
      navigator.keyboard?.addEventListener?.("layoutchange", refreshLayoutMap);
      cleanups.push(() => {
        try {
          navigator.keyboard?.removeEventListener?.("layoutchange", refreshLayoutMap);
        } catch (_) {
          /* ignore */
        }
      });
    } catch (_) {
      /* Keyboard API unavailable */
    }

    /**
     * Layout-aware letter for shortcut matching.
     * Prefer layout map + code (works with modifiers); then e.key; then Key*.
     * @param {KeyboardEvent} e
     */
    function layoutLetter(e) {
      const code = String(e.code || "");
      if (layoutMap && code) {
        try {
          const mapped = layoutMap.get(code);
          if (typeof mapped === "string" && mapped.length === 1) {
            return mapped.toLowerCase();
          }
        } catch (_) {
          /* ignore */
        }
      }

      const k = e.key;
      if (typeof k === "string" && k.length === 1) {
        const c = k.charCodeAt(0);
        // Ctrl+letter sometimes yields ASCII control chars (Ctrl+A → 0x01).
        if (c >= 1 && c <= 26) return String.fromCharCode(96 + c);
        return k.toLowerCase();
      }

      const m = /^Key([A-Z])$/.exec(code);
      return m ? m[1].toLowerCase() : "";
    }

    // Optional Spicetify path (same letter semantics).
    const Keyboard = Spicetify?.Keyboard;
    if (Keyboard && typeof Keyboard.registerShortcut === "function") {
      /** @type {Array<object>} */
      const registered = [];

      /**
       * @param {object} spec
       * @param {(e?: KeyboardEvent) => void} fn
       */
      function bind(spec, fn) {
        try {
          Keyboard.registerShortcut(spec, fn);
          registered.push(spec);
        } catch (err) {
          console.warn("Weave: Keyboard.registerShortcut failed", spec, err);
        }
      }

      bind({ key: "s", ctrl: true, shift: true }, (e) => {
        e?.preventDefault?.();
        run((h) => {
          if (!h.saving) h.handleSaveAsNew();
        });
      });
      bind({ key: "s", ctrl: true }, (e) => {
        e?.preventDefault?.();
      });
      bind({ key: "f", ctrl: true }, (e) => {
        if (isTypingTarget(e?.target)) return;
        e?.preventDefault?.();
        run((h) => h.handleToggleSearch());
      });
      bind({ key: "a", ctrl: true, shift: true }, (e) => {
        if (isTypingTarget(e?.target)) return;
        e?.preventDefault?.();
        run((h) => {
          if (h.playlist) h.openPanel("addTrack");
        });
      });
      bind({ key: "c", ctrl: true, shift: true }, (e) => {
        if (isTypingTarget(e?.target)) return;
        e?.preventDefault?.();
        run((h) => {
          if (h.playlist) h.openPanel("copyPlaylist");
        });
      });
      bind({ key: "f", ctrl: true, shift: true }, (e) => {
        if (isTypingTarget(e?.target)) return;
        e?.preventDefault?.();
        run((h) => {
          if (h.playlist && h.tracks.length) h.openPanel("flowify");
        });
      });
      bind({ key: "g", ctrl: true, shift: true }, (e) => {
        if (isTypingTarget(e?.target)) return;
        e?.preventDefault?.();
        run((h) => {
          if (h.playlist && h.tracks.length) h.openPanel("generator");
        });
      });
      bind({ key: "t", ctrl: true, shift: true }, (e) => {
        if (isTypingTarget(e?.target)) return;
        e?.preventDefault?.();
        run((h) => h.togglePanel("stats"));
      });

      cleanups.push(() => {
        for (const spec of registered) {
          try {
            Keyboard._deregisterShortcut?.(spec);
          } catch (_) {
            /* ignore */
          }
        }
      });
    }

    function onKey(e) {
      const h = handlersRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const typing = isTypingTarget(e.target);
      const key = layoutLetter(e);

      if (e.key === "Escape") {
        if (h.closeTopOverlay()) claim(e);
        return;
      }

      if (!mod && !typing && (e.key === "?" || (key === "/" && e.shiftKey))) {
        claim(e, () => run((hh) => hh.togglePanel("shortcuts")));
        return;
      }

      if (!mod) return;

      if (key === "s" && e.shiftKey) {
        claim(e, () =>
          run((hh) => {
            if (!hh.saving) hh.handleSaveAsNew();
          })
        );
        return;
      }
      if (key === "s" && !e.shiftKey) {
        claim(e);
        return;
      }

      if (typing) return;

      if (key === "f" && !e.shiftKey) {
        claim(e, () => run((hh) => hh.handleToggleSearch()));
        return;
      }
      if (key === "a" && e.shiftKey) {
        claim(e, () =>
          run((hh) => {
            if (hh.playlist) hh.openPanel("addTrack");
          })
        );
        return;
      }
      if (key === "c" && e.shiftKey) {
        claim(e, () =>
          run((hh) => {
            if (hh.playlist) hh.openPanel("copyPlaylist");
          })
        );
        return;
      }
      if (key === "f" && e.shiftKey) {
        claim(e, () =>
          run((hh) => {
            if (hh.playlist && hh.tracks.length) hh.openPanel("flowify");
          })
        );
        return;
      }
      if (key === "g" && e.shiftKey) {
        claim(e, () =>
          run((hh) => {
            if (hh.playlist && hh.tracks.length) hh.openPanel("generator");
          })
        );
        return;
      }
      if (key === "t" && e.shiftKey) {
        claim(e, () => run((hh) => hh.togglePanel("stats")));
      }
    }

    window.addEventListener("keydown", onKey, true);
    document.addEventListener("keydown", onKey, true);
    cleanups.push(() => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keydown", onKey, true);
    });

    return () => {
      for (const c of cleanups) c();
    };
  }, []);
}
