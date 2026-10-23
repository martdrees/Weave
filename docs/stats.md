# Stats

Charts and summary stats for the loaded playlist’s audio features.

![Toolbar — Stats](screenshots/toolbar-actions.png)

Shortcut: **`Ctrl/⌘ Shift T`**

## Open the panel

1. Load a playlist with tracks (features enriched).
2. Click **Stats** (stays active while open).
3. The Stats panel opens (similar placement to Recommendations).

## What you see

- Track count and an overall **smoothness** score when enough data exists.
- Legend:
  - **Raw** — per-track feature values along the playlist
  - **5-track avg** — moving average smoothing
- Toggle which metrics appear as charts (energy, danceability, valence, tempo, aggregate change, …). At least one chart stays visible.
- Chart selections are saved in prefs.

## Reading the charts

- X-axis follows playlist order (track index).
- Spikes show sudden feature jumps — useful before/after [Flowify](flowify.md).
- If you see *No enriched feature data yet*, wait for enrichment or reload the playlist.

Close with the panel close control or **Esc**.
