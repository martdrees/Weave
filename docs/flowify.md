# Flowify

Auto-arrange the current playlist by audio-feature **sets** or **curves**. Undo restores the previous order.

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

Default weights emphasize **energy**, then **valence**, then **tempo**. At least one weight must be above 0.

3. Click **Apply arrangement** (or **Reset** to defaults).
4. The table reorders and may flash briefly. Use **Undo** if you dislike the result.

## Tips

- Flowify only changes local order until you [Save](save-and-history.md).
- Your last Flowify options are remembered in prefs.
- Generator can optionally Flowify a preview after generate ([Generator](generator.md)).
