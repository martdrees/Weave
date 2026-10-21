//@ts-check

/**
 * Spicetify custom-app entry.
 * @see https://spicetify.app/docs/development/custom-apps
 *
 * Spicetify concatenates this file first, then manifest `subfiles`, and
 * exports `render` as the page default. No JSX — use createElement / `h`.
 * Page UI: `MixAppPage` in src/App.js (last subfile).
 */
const react = Spicetify.React;

function render() {
  return react.createElement(MixAppPage);
}
