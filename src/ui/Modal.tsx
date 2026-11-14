import React from "react";
import { t } from "../i18n/index.ts";

const WEAVE_MODAL_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function weaveModalFocusables(root: Element | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll(WEAVE_MODAL_FOCUSABLE)).filter(
    (el): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.getAttribute("aria-hidden") === "true") return false;
      return el.getClientRects().length > 0;
    }
  );
}

function weaveModalFocusInitial(dialog: HTMLElement | null): void {
  if (!dialog) return;
  // preventScroll: results / add-track bodies are overflow:auto — default
  // focus() would scroll those panes to the focused control.
  const focusOpts: FocusOptions = { preventScroll: true };
  const marked = dialog.querySelector("[data-autofocus]");
  if (marked instanceof HTMLElement && marked.getClientRects().length) {
    marked.focus(focusOpts);
    return;
  }
  const list = weaveModalFocusables(dialog);
  const inBody = list.filter((el) => !el.closest(".weave-recommend-header"));
  const target = inBody[0] || list[0];
  if (target) {
    target.focus(focusOpts);
    return;
  }
  dialog.focus(focusOpts);
}

export type ModalProps = {
  open: boolean;
  title: string;
  meta?: string | number | null;
  onClose?: () => void;
  ariaLabel?: string;
  className?: string;
  closeDisabled?: boolean;
  closeTitle?: string;
  children?: React.ReactNode;
};

/**
 * Shared overlay modal shell: Escape, click-outside, header, focus trap.
 */
export function Modal(props: ModalProps): React.ReactElement | null {
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
  } = props;

  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const previousFocusRef = React.useRef<Element | null>(null);
  // Keep latest handlers without re-running the open effect (re-focusing the
  // first body control scrolls .weave-search-results-body back to the top
  // when parent re-renders after play / playingUri updates).
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  const closeDisabledRef = React.useRef(closeDisabled);
  closeDisabledRef.current = closeDisabled;

  React.useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current =
      document.activeElement instanceof Element ? document.activeElement : null;

    const frame = requestAnimationFrame(() => {
      weaveModalFocusInitial(dialogRef.current);
    });

    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        if (closeDisabledRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const list = weaveModalFocusables(dialog);
      if (!list.length) {
        e.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      const focusOpts: FocusOptions = { preventScroll: true };

      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus(focusOpts);
        }
      } else if (active === last || !dialog.contains(active)) {
        e.preventDefault();
        first.focus(focusOpts);
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
          prev.focus({ preventScroll: true });
        } catch {
          /* element may be gone */
        }
      }
    };
  }, [open]);

  if (!open) return null;

  const dialogClass = ["weave-results-modal", className].filter(Boolean).join(" ");
  const closeLabel = closeTitle || t("common.close");

  return (
    <div
      className="weave-results-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !closeDisabled) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className={dialogClass}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title || t("common.dialog")}
        tabIndex={-1}
      >
        <div className="weave-recommend-header">
          <div className="weave-search-panel-title-row">
            <h2>{title}</h2>
            {meta != null && meta !== "" ? (
              <span className="weave-recommend-meta">{String(meta)}</span>
            ) : null}
          </div>
          <button
            type="button"
            className="weave-icon-btn"
            onClick={onClose}
            disabled={!!closeDisabled}
            title={closeLabel}
            aria-label={closeLabel}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
