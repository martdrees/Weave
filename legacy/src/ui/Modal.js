//@ts-check
/**
 * Shared overlay modal shell (R2.2): Escape, click-outside, header, dialog chrome.
 * R6.1 — focus first control on open, Tab trap, restore trigger on close.
 * Inventory: docs/COMPONENTS.md — Modal shell.
 */

const WEAVE_MODAL_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {Element|null} root
 * @returns {HTMLElement[]}
 */
function weaveModalFocusables(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(WEAVE_MODAL_FOCUSABLE)).filter((el) => {
    if (!(el instanceof HTMLElement)) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    return el.getClientRects().length > 0;
  });
}

/**
 * @param {HTMLElement|null} dialog
 */
function weaveModalFocusInitial(dialog) {
  if (!dialog) return;
  const marked = dialog.querySelector("[data-autofocus]");
  if (marked instanceof HTMLElement && marked.getClientRects().length) {
    marked.focus();
    return;
  }
  const list = weaveModalFocusables(dialog);
  // Prefer first control in the body (skip header ✕) when content has inputs.
  const inBody = list.filter((el) => !el.closest(".weave-recommend-header"));
  const target = inBody[0] || list[0];
  if (target) {
    target.focus();
    return;
  }
  dialog.focus();
}

/**
 * @param {{
 *   open: boolean,
 *   title: string,
 *   meta?: string|number|null,
 *   onClose?: () => void,
 *   ariaLabel?: string,
 *   className?: string,
 *   closeDisabled?: boolean,
 *   closeTitle?: string,
 *   children?: any,
 * }} props
 */
function WeaveModal(props) {
  const react = Spicetify.React;
  const {
    open,
    title,
    meta,
    onClose,
    ariaLabel,
    className,
    closeDisabled,
    closeTitle,
    children,
  } = props || {};

  const dialogRef = react.useRef(null);
  const previousFocusRef = react.useRef(/** @type {Element|null} */ (null));

  react.useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current =
      document.activeElement instanceof Element ? document.activeElement : null;

    const frame = requestAnimationFrame(() => {
      weaveModalFocusInitial(dialogRef.current);
    });

    function onKey(e) {
      if (e.key === "Escape") {
        if (closeDisabled) return;
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const list = weaveModalFocusables(dialog);
      if (!list.length) {
        e.preventDefault();
        dialog.focus();
        return;
      }

      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey, true);
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev instanceof HTMLElement && typeof prev.focus === "function") {
        try {
          prev.focus();
        } catch (_) {
          /* element may be gone */
        }
      }
    };
  }, [open, onClose, closeDisabled]);

  if (!open) return null;

  const dialogClass = ["weave-results-modal", className].filter(Boolean).join(" ");

  return h(
    "div",
    {
      className: "weave-results-overlay",
      role: "presentation",
      onClick: (e) => {
        if (e.target === e.currentTarget && !closeDisabled) onClose?.();
      },
    },
    h(
      "div",
      {
        ref: dialogRef,
        className: dialogClass,
        role: "dialog",
        "aria-modal": "true",
        "aria-label": ariaLabel || title || WeaveI18n.t("common.dialog"),
        tabIndex: -1,
      },
      h(
        "div",
        { className: "weave-recommend-header" },
        h(
          "div",
          { className: "weave-search-panel-title-row" },
          h("h2", null, title),
          meta != null && meta !== ""
            ? h("span", { className: "weave-recommend-meta" }, String(meta))
            : null
        ),
        h(
          "button",
          {
            type: "button",
            className: "weave-icon-btn",
            onClick: onClose,
            disabled: !!closeDisabled,
            title: closeTitle || WeaveI18n.t("common.close"),
            "aria-label": closeTitle || WeaveI18n.t("common.close"),
          },
          "✕"
        )
      ),
      children
    )
  );
}
