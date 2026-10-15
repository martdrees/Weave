//@ts-check

function MixAppToolbar(props) {
  const react = Spicetify.React;
  const {
    playlist,
    tracks,
    dirty,
    canUndo,
    canRedo,
    saving,
    onUndo,
    onRedo,
    onSave,
    onSaveAsNew,
  } = props;

  const owned = !!(playlist?.isOwnedBySelf || playlist?.collaborative);
  const hasTracks = Array.isArray(tracks) && tracks.length > 0;

  return react.createElement(
    "div",
    { className: "mixapp-toolbar" },
    react.createElement(
      "div",
      { className: "mixapp-toolbar-meta" },
      react.createElement(
        "strong",
        { className: "mixapp-toolbar-title" },
        playlist?.name || "No playlist loaded"
      ),
      dirty
        ? react.createElement("span", { className: "mixapp-badge" }, "Unsaved")
        : null
    ),
    react.createElement(
      "div",
      { className: "mixapp-toolbar-actions" },
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn mixapp-btn-ghost",
          onClick: onUndo,
          disabled: !canUndo || saving,
          title: "Undo",
        },
        "Undo"
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn mixapp-btn-ghost",
          onClick: onRedo,
          disabled: !canRedo || saving,
          title: "Redo",
        },
        "Redo"
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn",
          onClick: onSave,
          disabled: !playlist || !dirty || saving || !owned,
          title: owned
            ? "Overwrite playlist with current order"
            : "You can only overwrite playlists you own",
        },
        saving ? "Saving…" : "Save"
      ),
      react.createElement(
        "button",
        {
          type: "button",
          className: "mixapp-btn mixapp-btn-primary",
          onClick: onSaveAsNew,
          disabled: !playlist || !hasTracks || saving,
          title: "Create a new playlist with the current track list",
        },
        "Save as new"
      )
    )
  );
}
