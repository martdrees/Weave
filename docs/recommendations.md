# Recommendations

Find tracks similar to your playlist or seeds, then add them to the list.

![Open Recommendations from the toolbar](screenshots/toolbar-actions.png)

Shortcut: **`Ctrl/⌘ F`**

## Open the panel

1. Load a playlist with at least one track (or mark [seeds](seeds.md)).
2. Click **Recommendations** in the toolbar (button stays active while open).
3. The panel appears between the toolbar and the track table.

## Header actions

| Control | What it does |
| ------- | ------------ |
| Fit to seeds | Sets feature min/max from marked seed audio features |
| Reset ranges | Clears feature range filters |
| Max results | Caps how many tracks to return |
| Search | Runs the recommendation query |

If no seeds are marked, Weave searches from the **current playlist** as context (`No seeds — searching from this playlist`).

## Feature ranges

Enable a feature (energy, danceability, valence, tempo, …) and set **min–max** with the dual sliders.

- **Avg** — when averages are available (from seeds/playlist), snap the range around the average for that feature.
- Filtering uses hard min/max only (tracks outside the range are dropped).

## Mix in key (Camelot)

Optional harmonic moves relative to seed keys, for example:

| Move | Idea |
| ---- | ---- |
| Harmonic | Stay in the same key |
| More / Less energy | Camelot number ±1 |
| Brighter / Darker mood | A↔B letter flip |
| Energie Boost | Jump +2 |
| Mood / Harmonic Shift | Diagonal or ±5 “jaws” moves |

## Filters

| Filter | Effect |
| ------ | ------ |
| Hide in playlist | Skip tracks already in your list |
| Hide artists | Avoid artists already in the list |
| No explicit | Drop explicit tracks |
| No aberrant | Drop odd/placeholder titles |
| Year From / To | Limit by release year |

## Results

1. After **Search**, a **Results** list appears.
2. Preview with play if available.
3. **Add** one track, or multi-select and **Add selected**.
4. New rows flash and scroll into view in the arranger.

If you get *No matches after filters*, loosen ranges or turn filters off.

**Related:** [Add Track](add-track.md) · [Seeds](seeds.md)
