# Save and history

Undo/redo local **draft** edits (especially Flowify), then write those back to Spotify with Save. **Add**, **remove**, and single-row **reorder** already persist to Spotify immediately when the playlist is writable and not already dirty (no Save required for those alone).

![Toolbar actions including Save](screenshots/toolbar-actions.png)

## Undo / Redo

| Action | Shortcut | When |
| ------ | -------- | ---- |
| Undo | `Ctrl/⌘ Z` | Reverse the last **local draft** edit (Flowify, …). Add/remove/reorder that already wrote to Spotify are not undone this way. |
| Redo | `Ctrl/⌘ Shift Z` or `Ctrl/⌘ Y` | Re-apply after Undo |

Buttons disable when there is nothing to undo/redo, or while a save is in progress.

## Unsaved badge

After **draft** changes (for example Flowify Apply), an **Unsaved** badge appears next to the playlist picker. It clears after a successful Save that matches Spotify. Add/remove/single-row reorder alone do not show Unsaved — they already wrote through to Spotify when the playlist was clean. While Unsaved is on, further reorders stay in the draft (they do not write through) until you Save or Undo.

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
- If Spotify changed the same playlist while Weave has unsaved edits, Weave asks whether to reload, keep Weave, or overwrite Spotify — see [Playlist picker](playlist-picker.md).
