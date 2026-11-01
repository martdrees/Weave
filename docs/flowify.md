# Flowify

Live-preview a new playlist order by audio-feature **sets** or **curves**, then **Apply to playlist** (one bulk write) or **Save as new** (opens the new playlist). Cancel / close discards the preview; Spotify and the arranger stay unchanged until you commit.

![Toolbar — Flowify](screenshots/toolbar-actions.png)

Shortcut: **`Ctrl/⌘ Shift F`**

## Before you start

- Load a playlist with at least two tracks.
- Features (energy, tempo, …) should be enriched; Flowify will try to enrich if needed.

## Open and configure

1. Click **Flowify**.
2. Choose a method:

### Sets

Groups tracks into blocks of similar character.

| Option | Role |
| ------ | ---- |
| Set size | Tracks per set (2–20, default 4) |
| Feature weights | How strongly each feature drives grouping (0–100%) |

### Curves

Orders the playlist so features follow a shape over time.

| Option | Role |
| ------ | ---- |
| Curve shape | Peak in middle, Valley in middle, Rise, Fall, Flat |
| Feature weights | Influence of each feature on the curve |
| Inv | Invert that feature’s curve (anti-correlate) |

Default weights emphasize **energy**, then **valence**, then **tempo**. At least one weight must be above 0. The preview table updates live as you change options (Spotify unchanged).

3. Audition rows in the preview table if you like.
4. **Apply to playlist** — one `applyBulk` write; the arranger matches Spotify. The modal stays open until the write finishes, then closes. **Save as new** — creates a playlist from the preview and **loads it**. **Cancel** / close — discard preview; no write.

## Tips

- Apply and Save as new stay disabled until a live preview is ready.
- Your last Flowify options are remembered in prefs.
- Generator can optionally Flowify a preview after generate ([Generator](generator.md)).
- See also [Save as new and live edits](save-and-history.md).
