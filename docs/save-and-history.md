# Save and history

Undo/redo local edits, then write the playlist back to Spotify.

![Toolbar actions including Save](screenshots/toolbar-actions.png)

## Undo / Redo

| Action | Shortcut | When |
| ------ | -------- | ---- |
| Undo | `Ctrl/⌘ Z` | Reverse the last local edit (reorder, add, remove, Flowify, …) |
| Redo | `Ctrl/⌘ Shift Z` or `Ctrl/⌘ Y` | Re-apply after Undo |

Buttons disable when there is nothing to undo/redo, or while a save is in progress.

## Unsaved badge

After local changes, an **Unsaved** badge appears next to the playlist picker. It clears after a successful Save that matches Spotify.

## Save

- **Save** (`Ctrl/⌘ S`) — overwrite the **current** playlist with the editor order and membership.
- Enabled only when:
  - There are unsaved changes, and
  - You **own** the playlist (or it is collaborative in a way Weave treats as writable).
- On playlists you do not own, Save stays disabled; use **Save as new** instead.

A short message confirms *Playlist saved*, or explains errors if the playlist changed on Spotify during save / rate limits.

## Save as new

- **Save as new** (`Ctrl/⌘ Shift S`) — create a **new** playlist with the current track list (does not overwrite the original).
- Works even when you cannot overwrite the source playlist.
- Default naming often appends `(Weave)` to the source name.

## Tips

- Prefer Undo before Save if you are exploring Flowify settings.
- Session restore may bring back unsaved work after restart; still confirm before Save.
