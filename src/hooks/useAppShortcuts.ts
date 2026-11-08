import { getReactLoose } from "./reactHost.ts";
/**
 * Global shortcut map + Esc overlay stack (layout-aware keys).
 */

type HookLoose = any;

/**
 * Global shortcut map + Esc overlay stack.
 *
 * Letter chords follow the **active OS keyboard layout**:
 * `(navigator as any).keyboard.getLayoutMap()` maps `e.code` → character. That stays
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
export function useAppShortcuts(handlers: HookLoose) {
  const react = getReactLoose();
  const handlersRef = react.useRef(handlers);
  handlersRef.current = handlers;

  function isTypingTarget(el: any) {
    if (!el) return false;
    const tag = String(el.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    return !!el.closest?.("input, textarea, select, [contenteditable=true]");
  }

  react.useEffect(() => {
    const cleanups: Array<() => void> = [];
    let lastFireAt = 0;
    let layoutMap: any = null;

    function run(fn: any) {
      const now = Date.now();
      if (now - lastFireAt < 80) return;
      lastFireAt = now;
      try {
        fn(handlersRef.current);
      } catch (err: any) {
        console.warn("Weave: shortcut handler failed", err);
      }
    }

    /**
     * @param {KeyboardEvent} e
     * @param {() => void} [action]
     */
    function claim(e: any, action?: any) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation();
      }
      if (action) action();
    }

    async function refreshLayoutMap() {
      try {
        const kb = (navigator as any).keyboard;
        if (kb && typeof kb.getLayoutMap === "function") {
          layoutMap = await kb.getLayoutMap();
        }
      } catch (_: any) {
        layoutMap = null;
      }
    }
    void refreshLayoutMap();
    try {
      (navigator as any).keyboard?.addEventListener?.("layoutchange", refreshLayoutMap);
      cleanups.push(() => {
        try {
          (navigator as any).keyboard?.removeEventListener?.(
            "layoutchange",
            refreshLayoutMap
          );
        } catch (_: any) {
          /* ignore */
        }
      });
    } catch (_: any) {
      /* Keyboard API unavailable */
    }

    /**
     * Layout-aware letter for shortcut matching.
     * Prefer layout map + code (works with modifiers); then e.key; then Key*.
     * @param {KeyboardEvent} e
     */
    function layoutLetter(e: any) {
      const code = String(e.code || "");
      if (layoutMap && code) {
        try {
          const mapped = layoutMap.get(code);
          if (typeof mapped === "string" && mapped.length === 1) {
            return mapped.toLowerCase();
          }
        } catch (_: any) {
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
      const registered: any[] = [];

      /**
       * @param {object} spec
       * @param {(e?: KeyboardEvent) => void} fn
       */
      function bind(spec: any, fn: any) {
        try {
          Keyboard.registerShortcut(spec, fn);
          registered.push(spec);
        } catch (err: any) {
          console.warn("Weave: Keyboard.registerShortcut failed", spec, err);
        }
      }

      bind({ key: "s", ctrl: true, shift: true }, (e: any) => {
        e?.preventDefault?.();
        run((h: any) => {
          if (!h.saving) h.handleSaveAsNew();
        });
      });
      bind({ key: "s", ctrl: true }, (e: any) => {
        e?.preventDefault?.();
      });
      bind({ key: "f", ctrl: true }, (e: any) => {
        if (isTypingTarget(e?.target)) return;
        e?.preventDefault?.();
        run((h: any) => h.handleToggleSearch());
      });
      bind({ key: "a", ctrl: true, shift: true }, (e: any) => {
        if (isTypingTarget(e?.target)) return;
        e?.preventDefault?.();
        run((h: any) => {
          if (h.playlist) h.openPanel("addTrack");
        });
      });
      bind({ key: "c", ctrl: true, shift: true }, (e: any) => {
        if (isTypingTarget(e?.target)) return;
        e?.preventDefault?.();
        run((h: any) => {
          if (h.playlist) h.openPanel("copyPlaylist");
        });
      });
      bind({ key: "f", ctrl: true, shift: true }, (e: any) => {
        if (isTypingTarget(e?.target)) return;
        e?.preventDefault?.();
        run((h: any) => {
          if (h.playlist && h.tracks.length) h.openPanel("flowify");
        });
      });
      bind({ key: "g", ctrl: true, shift: true }, (e: any) => {
        if (isTypingTarget(e?.target)) return;
        e?.preventDefault?.();
        run((h: any) => {
          if (h.playlist && h.tracks.length) h.openPanel("generator");
        });
      });
      bind({ key: "t", ctrl: true, shift: true }, (e: any) => {
        if (isTypingTarget(e?.target)) return;
        e?.preventDefault?.();
        run((h: any) => h.togglePanel("stats"));
      });

      cleanups.push(() => {
        for (const spec of registered) {
          try {
            Keyboard._deregisterShortcut?.(spec);
          } catch (_: any) {
            /* ignore */
          }
        }
      });
    }

    function onKey(e: any) {
      const h = handlersRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const typing = isTypingTarget(e.target);
      const key = layoutLetter(e);

      if (e.key === "Escape") {
        if (h.closeTopOverlay()) claim(e);
        return;
      }

      if (!mod && !typing && (e.key === "?" || (key === "/" && e.shiftKey))) {
        claim(e, () => run((hh: any) => hh.togglePanel("shortcuts")));
        return;
      }

      if (!mod) return;

      if (key === "s" && e.shiftKey) {
        claim(e, () =>
          run((hh: any) => {
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
        claim(e, () => run((hh: any) => hh.handleToggleSearch()));
        return;
      }
      if (key === "a" && e.shiftKey) {
        claim(e, () =>
          run((hh: any) => {
            if (hh.playlist) hh.openPanel("addTrack");
          })
        );
        return;
      }
      if (key === "c" && e.shiftKey) {
        claim(e, () =>
          run((hh: any) => {
            if (hh.playlist) hh.openPanel("copyPlaylist");
          })
        );
        return;
      }
      if (key === "f" && e.shiftKey) {
        claim(e, () =>
          run((hh: any) => {
            if (hh.playlist && hh.tracks.length) hh.openPanel("flowify");
          })
        );
        return;
      }
      if (key === "g" && e.shiftKey) {
        claim(e, () =>
          run((hh: any) => {
            if (hh.playlist && hh.tracks.length) hh.openPanel("generator");
          })
        );
        return;
      }
      if (key === "t" && e.shiftKey) {
        claim(e, () => run((hh: any) => hh.togglePanel("stats")));
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
