//@ts-check
/**
 * Hyperscript-style createElement alias (R6.4).
 * Prefer `h(...)` in UI trees instead of `react.createElement(...)`.
 * Hooks still use `Spicetify.React` (`useState`, etc.).
 *
 * @type {typeof Spicetify.React.createElement}
 */
function WeaveH(type, props, ...children) {
  return Spicetify.React.createElement(type, props ?? null, ...children);
}

/** @type {typeof WeaveH} — global alias for UI modules */
var h = WeaveH;
