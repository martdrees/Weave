import React from "react";
import { t } from "../i18n/index.ts";
import { Modal } from "./Modal.tsx";

export type ShortcutsHelpProps = {
  open: boolean;
  onClose?: () => void;
};

export function ShortcutsHelp(props: ShortcutsHelpProps): React.ReactElement {
  const { open, onClose } = props;

  const rows: Array<[string, string]> = [
    ["Ctrl/⌘ + Shift + S", t("shortcuts.saveAsNew")],
    ["Ctrl/⌘ + F", t("shortcuts.toggleRecs")],
    ["Ctrl/⌘ + Shift + A", t("shortcuts.addTrack")],
    ["Ctrl/⌘ + Shift + C", t("shortcuts.copy")],
    ["Ctrl/⌘ + Shift + F", t("shortcuts.flowify")],
    ["Ctrl/⌘ + Shift + G", t("shortcuts.generator")],
    ["Ctrl/⌘ + Shift + T", t("shortcuts.toggleStats")],
    ["↑ / ↓", t("shortcuts.selectTrack")],
    ["Alt + ↑ / ↓", t("shortcuts.moveTrack")],
    ["Home / End", t("shortcuts.firstLast")],
    ["Delete", t("shortcuts.removeTrack")],
    ["?", t("shortcuts.showHelp")],
    ["Esc", t("shortcuts.close")],
  ];

  return (
    <Modal
      open={open}
      title={t("shortcuts.title")}
      onClose={onClose}
      ariaLabel={t("shortcuts.title")}
      className="weave-find-modal weave-shortcuts-modal"
    >
      <div className="weave-shortcuts-body">
        <table className="weave-shortcuts-table">
          <tbody>
            {rows.map(([keys, action]) => (
              <tr key={keys}>
                <td className="weave-shortcuts-keys">{keys}</td>
                <td>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="weave-recommend-meta">{t("shortcuts.note")}</p>
      </div>
    </Modal>
  );
}
