/**
 * Skin switches in the Workshop film: a cut between two pictures of the same character in other
 * looks (Carmen's skins) gets a short flash, scale pop and light sweep (workers/creative-video/
 * remotion workshop-transition.ts) with the cut's whoosh at its peak. Every other cut keeps the
 * transitions of workshop-edit.mjs.
 */
import { sceneTransition, transitionFrames } from "./workshop-edit.mjs";

/** A skin switch's overlap in frames; one with less room than MIN_SKIN_FRAMES is not made. */
export const SKIN_FRAMES = 10;
const MIN_SKIN_FRAMES = 6;

/** The scene's picture: its source (asset or skin reference), else its file. */
const pictureOf = (scene) =>
  scene.pictureKey || scene.stillPath || scene.clipPath || null;

/**
 * True when the scene after `previous` shows the same character in another picture, so the cut
 * is a skin switch: the scene says so (meta.skin_switch, true or false), else when the pictures
 * differ and either the film has trailer sound design or both scenes have their own skin
 * reference and the references differ. A scene that asked for another transition keeps it.
 */
export function isSkinSwitch(previous, current, { soundDesign = false } = {}) {
  if (!previous || !current) return false;
  if (current.skinSwitch === true || current.transition === "skin") return true;
  if (current.skinSwitch === false || current.transition) return false;
  const before = pictureOf(previous);
  const after = pictureOf(current);
  if (!before || !after || before === after) return false;
  if (soundDesign === true) return true;
  return (
    !!previous.skinRef &&
    !!current.skinRef &&
    previous.skinRef !== current.skinRef
  );
}

/**
 * The transition into scene `index` with its overlap frames: a skin switch when `skin` and
 * both scenes have room for one (SKIN_FRAMES, at most a third of either scene), else
 * sceneTransition's choice.
 */
export function sceneTransitionFor(
  index,
  requested,
  { skin = false, previousFrames = 0, frames = 0 } = {},
) {
  if (index > 0 && skin) {
    const overlap = Math.min(
      SKIN_FRAMES,
      Math.floor(previousFrames / 3),
      Math.floor(frames / 3),
    );
    if (overlap >= MIN_SKIN_FRAMES)
      return { transition: "skin", transitionFrames: overlap };
  }
  const transition = sceneTransition(
    index,
    requested === "skin" ? null : requested,
  );
  return {
    transition,
    transitionFrames: transitionFrames(
      index ? previousFrames : 0,
      frames,
      transition,
    ),
  };
}
