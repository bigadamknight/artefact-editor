/**
 * Canonical list of CSS properties exposed to the editor as style.* descriptors
 * AND read live from the iframe's computed style. Both sides MUST agree on
 * this list, so it lives in one place.
 */
export const STYLE_PROPS = [
  "color",
  "font-size",
  "font-weight",
  "font-family",
  "text-align",
  "letter-spacing",
  "line-height",
  "top",
  "left",
  "right",
  "bottom",
  "width",
  "height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "transform",
  "opacity",
  "z-index",
] as const;

export type StyleProp = (typeof STYLE_PROPS)[number];
