/**
 * How a Workshop film moves from scene to scene and how it closes (Remotion
 * workshop-transitions.ts and workshop-end-card.tsx draw them). A scene's own transition
 * (meta.transition) wins over the film's default cycle (workshop-edit.mjs); the closing card's
 * design, what plays behind it and whether it sits on glass are the film's (payload.video.end_card_style,
 * end_card_background, end_card_glass).
 */

/** The transitions Carmen can choose; "skin" is the worker's own (skin-switch.mjs). */
export const SCENE_TRANSITIONS = [
  "cut",
  "crossfade",
  "slide",
  "wipe",
  "zoom",
  "whip",
  "ripple",
  "glitch",
];

/** The closing card's designs; "classic" is the card a film gets without a choice. */
export const END_CARD_STYLES = ["classic", "bold", "minimal", "split"];

/** A transition Carmen can choose, or null. */
export const sceneTransitionOf = (value) =>
  SCENE_TRANSITIONS.includes(value) ? value : null;

/** A known end-card design, or null. */
export const endCardStyleOf = (value) =>
  END_CARD_STYLES.includes(value) ? value : null;

/**
 * What plays behind the closing card (Remotion workshop-end-card-backdrop.ts); a film without a
 * choice keeps its last scene playing, blurred, behind the card.
 */
export const END_CARD_BACKGROUNDS = [
  "last-scene",
  "gradient",
  "pattern",
  "particles",
  "light-rays",
  "plain",
];

/** A known end-card background, or null. */
export const endCardBackgroundOf = (value) =>
  END_CARD_BACKGROUNDS.includes(value) ? value : null;

/** Whether the closing card's logo and call to action sit on frosted glass: only a real true. */
export const endCardGlassOf = (value) => value === true;
