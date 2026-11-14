import React from "react";
import { t } from "../../i18n/index.ts";

export type HeaderProps = {
  onOpenShortcuts?: () => void;
};

/**
 * App chrome: logo, title/subtitle, shortcuts affordance.
 */
export function Header(props: HeaderProps): React.ReactElement {
  const { onOpenShortcuts } = props;

  return (
    <header className="weave-header">
      <div className="weave-header-row">
        <div className="weave-title-group">
          <svg
            className="weave-logo"
            viewBox="0 0 64 64"
            width={36}
            height={36}
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M8 42C16 42 18 22 32 22S48 42 56 42"
              fill="none"
              stroke="#5F8F7A"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8 22C16 22 18 42 32 42S48 22 56 22"
              fill="none"
              stroke="#B8D4C4"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h1 className="weave-title">
            {t("app.name")}
            <span className="weave-title-sep" aria-hidden="true">
              |
            </span>
            <span className="weave-subtitle">{t("app.subtitle")}</span>
          </h1>
        </div>
        <button
          type="button"
          className="weave-icon-btn weave-icon-btn-compact"
          onClick={() => onOpenShortcuts?.()}
          title={t("app.shortcutsHint")}
          aria-label={t("app.shortcuts")}
        >
          <svg
            viewBox="0 0 16 16"
            width={16}
            height={16}
            aria-hidden="true"
            focusable="false"
          >
            <path
              fill="currentColor"
              d="M14 5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h12zM2 4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H2zm2.5 3a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm2 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm2 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm2 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm2 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm-8 2a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm2 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm6 0a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm-4.5-.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3z"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
