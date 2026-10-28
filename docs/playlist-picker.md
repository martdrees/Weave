# Playlist picker

Load which playlist Weave edits.

![Playlist picker in the toolbar](screenshots/playlist-picker.png)

## What you see

| Control | Role |
| ------- | ---- |
| Dropdown | Lists playlists from your Spotify library |
| Track count | Number of tracks currently loaded (e.g. `50 tracks`) |
| Refresh | Reloads the playlist list **and** re-checks the open playlist against Spotify |

## How to use

1. Open the dropdown and choose a playlist.
2. Weave fetches tracks and audio features into the table.
3. If a playlist is missing or outdated, click **Refresh**.

## Sync with Spotify

When you open Weave again, return focus to it, or click **Refresh**, Weave compares the open playlist to Spotify (track membership and order only).

| Weave state | Spotify vs last sync | What happens |
| ----------- | -------------------- | ------------ |
| Unsaved edits | Same as last sync | Nothing |
| Unsaved edits | Changed | Dialog: reload from Spotify, keep Weave, or overwrite Spotify |
| Saved | Changed | Reloads from Spotify (toast: *Playlist updated from Spotify*) |
| Saved | Same | Nothing |

If you **Keep Weave edits**, a **Spotify changed** badge stays until you save or reload. Weave will not ask again for that same Spotify revision.

If the playlist was deleted or made private while you have unsaved edits, Weave offers **Keep Weave** or **Save as new**.

## Notes

- The empty state says *Select a playlist to edit its track order* until you pick one.
- Switching playlists loads that list; unsaved edits on the previous list are not written to Spotify until you Save / Save as new.
- Deleted or private playlists may show an error message — refresh and pick another.

**Next:** [Arranging tracks](arranging-tracks.md)
