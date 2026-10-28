//@ts-check

/**
 * External playlist drift / unavailable conflict dialog.
 *
 * @param {{
 *   open: boolean,
 *   kind: string|null,
 *   playlistName?: string|null,
 *   saving?: boolean,
 *   onReload?: () => void,
 *   onKeep?: () => void,
 *   onOverwrite?: () => void,
 *   onSaveAsNew?: () => void,
 *   onClose?: () => void,
 * }} props
 */
function MixAppSyncConflictModal(props) {
  const {
    open,
    kind,
    playlistName,
    saving,
    onReload,
    onKeep,
    onOverwrite,
    onSaveAsNew,
    onClose,
  } = props || {};

  if (!open || !kind) return null;

  const unavailable = kind === "unavailable";
  const title = unavailable
    ? MixAppI18n.t("sync.unavailableTitle")
    : MixAppI18n.t("sync.conflictTitle");
  const body = unavailable
    ? MixAppI18n.t("sync.unavailableBody", {
        name: playlistName || MixAppI18n.t("playlist.defaultName"),
      })
    : MixAppI18n.t("sync.conflictBody", {
        name: playlistName || MixAppI18n.t("playlist.defaultName"),
      });

  return h(
    MixAppModal,
    {
      open: true,
      title,
      onClose: onKeep || onClose,
      ariaLabel: title,
      className: "mixapp-sync-conflict-modal",
      closeDisabled: !!saving,
    },
    h(
      "div",
      { className: "mixapp-sync-conflict-body" },
      h("p", { className: "mixapp-sync-conflict-text" }, body),
      h(
        "div",
        { className: "mixapp-sync-conflict-actions" },
        unavailable
          ? [
              h(
                "button",
                {
                  key: "keep",
                  type: "button",
                  className: "mixapp-btn mixapp-btn-primary",
                  disabled: !!saving,
                  "data-autofocus": true,
                  onClick: onKeep,
                },
                MixAppI18n.t("sync.keepWeave")
              ),
              h(
                "button",
                {
                  key: "saveAs",
                  type: "button",
                  className: "mixapp-btn",
                  disabled: !!saving,
                  onClick: onSaveAsNew,
                },
                MixAppI18n.t("sync.saveAsNew")
              ),
            ]
          : [
              h(
                "button",
                {
                  key: "reload",
                  type: "button",
                  className: "mixapp-btn",
                  disabled: !!saving,
                  onClick: onReload,
                },
                MixAppI18n.t("sync.reloadSpotify")
              ),
              h(
                "button",
                {
                  key: "keep",
                  type: "button",
                  className: "mixapp-btn mixapp-btn-primary",
                  disabled: !!saving,
                  "data-autofocus": true,
                  onClick: onKeep,
                },
                MixAppI18n.t("sync.keepWeave")
              ),
              h(
                "button",
                {
                  key: "overwrite",
                  type: "button",
                  className: "mixapp-btn",
                  disabled: !!saving,
                  onClick: onOverwrite,
                },
                saving
                  ? MixAppI18n.t("toolbar.saving")
                  : MixAppI18n.t("sync.overwriteSpotify")
              ),
            ]
      )
    )
  );
}
