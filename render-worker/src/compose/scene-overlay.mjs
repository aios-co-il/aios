/**
 * The animated graphics drawn over a Workshop scene's picture, under its text (Remotion
 * workshop-overlays.ts draws them). A scene's own choice (meta.scene_overlay) wins over the
 * film's (payload.video.scene_overlay); "none" on a scene turns the film's off there.
 */

export const SCENE_OVERLAYS = [
  "none",
  "bubbles",
  "particles",
  "confetti",
  "light-leak",
  "lower-third",
];

/** A known overlay, or null. */
export const sceneOverlayOf = (value) =>
  SCENE_OVERLAYS.includes(value) ? value : null;

/** The manifest field of a scene's overlay: its own, else the film's; nothing for "none". */
export function overlayFieldOf(scene, timeline) {
  const overlay = scene.sceneOverlay || timeline.sceneOverlay || "none";
  return overlay === "none" ? {} : { overlay };
}
