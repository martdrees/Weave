# Generator

Build a **new** Spotify playlist from seeds (or the current playlist as soft seed), using the same recommend engine as Recommendations — without changing the Recommendations panel.

![Toolbar — Generator](screenshots/toolbar-actions.png)

Shortcut: `Ctrl/⌘ Shift G`

## Steps

1. Load a playlist. Optionally [mark seeds](seeds.md) (recommended).
2. Click **Generator**.
3. Set options:


| Field                  | Role                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Playlist name          | Name for the new playlist (default: current name + `(Weave)` or *Weave generated*) |
| Track count            | How many tracks to aim for                                                         |
| Feature ranges         | Same dual-range controls as Recommendations                                        |
| Exclude explicit       | Drop explicit tracks                                                               |
| Exclude aberrant       | Drop odd titles                                                                    |
| Flowify after generate | Run a sets Flowify on the preview                                                  |


1. Click **Generate** to build a **Preview** list.
2. Listen / inspect the preview.
3. Click **Create playlist** to create it on Spotify and fill it with the preview tracks.



## Notes

- Generator does **not** replace your current editor list; it creates a separate playlist.
- After create, a message confirms the name and track count.
- If not all tracks could be added, a message says the playlist was created but filling was incomplete.

**Related:** [Recommendations](recommendations.md) · [Flowify](flowify.md) · [Seeds](seeds.md)