import { type WorkshopScene } from "./manifest";

const END_TRANSITION = 12;

/**
 * Where each scene starts in the film, where the scenes end, and how many frames of a scene's
 * transition play over the scene before it.
 */
export function sceneTiming(scenes: Array<WorkshopScene>) {
  const starts: number[] = [];
  let cursor = 0;
  for (const scene of scenes) {
    starts.push(cursor);
    cursor += scene.durationFrames;
  }
  const enterOf = (index: number) =>
    Math.max(0, Math.min(starts[index], scenes[index].transitionFrames ?? 0));
  return { starts, cursor, enterOf };
}

/** The end card's fade-in, and the frame of the last scene's own clock the card starts at. */
export function endCardTiming(scenes: Array<WorkshopScene>, endFrames: number) {
  const { starts, cursor, enterOf } = sceneTiming(scenes);
  const endEnter = Math.min(END_TRANSITION, Math.floor(endFrames / 3));
  // The frame of the last scene's own clock the end card starts at: it plays on behind it.
  const last = scenes.length - 1;
  const lastSceneFrom =
    last < 0 ? 0 : cursor - endEnter - starts[last] + enterOf(last);
  return { endEnter, lastSceneFrom };
}
