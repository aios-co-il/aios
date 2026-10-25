/** Edit decisions for the Workshop film: transitions, scene lengths and the music mix. */

export const WORKSHOP_TRANSITIONS = ["crossfade", "slide", "zoom", "wipe"];
const ALL_TRANSITIONS = new Set([...WORKSHOP_TRANSITIONS, "cut"]);
const MAX_TRANSITION_FRAMES = 15;

export const MIX = {
  music: 0.2,
  musicDucked: 0.06,
  clipSolo: 0.9,
  clipUnderSpeech: 0.15,
};

/** The transition into scene `index`; the first scene opens from black. */
export function sceneTransition(index, requested) {
  if (index === 0) return "cut";
  if (ALL_TRANSITIONS.has(requested)) return requested;
  return WORKSHOP_TRANSITIONS[(index - 1) % WORKSHOP_TRANSITIONS.length];
}

/** Overlap frames between two scenes: at most a third of either scene. */
export function transitionFrames(previous, current, type) {
  if (type === "cut" || !previous) return 0;
  return Math.max(
    0,
    Math.min(
      MAX_TRANSITION_FRAMES,
      Math.floor(previous / 3),
      Math.floor(current / 3),
    ),
  );
}

/**
 * Stretches scene lengths in proportion so the pictures last at least `minTotal` frames.
 * Speech is never cut: the last scene absorbs rounding.
 */
export function fitScenes(frameCounts, minTotal) {
  const total = frameCounts.reduce((sum, n) => sum + n, 0);
  if (!frameCounts.length || !(minTotal > total)) return [...frameCounts];
  const scaled = frameCounts.map((n) => Math.floor((n * minTotal) / total));
  const used = scaled.reduce((sum, n) => sum + n, 0);
  scaled[scaled.length - 1] += Math.ceil(minTotal) - used;
  return scaled;
}

/** Speaking spans [start, end) in frames, joined when the pause is shorter than `gap`. */
export function speechSpans(spans, gap = 18) {
  const sorted = spans
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start - last[1] <= gap) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * Music volume keyframes ({ frames, volumes }, strictly increasing frames): the bed dips
 * under every speaking span and comes back up between them. Fades are applied on top.
 */
export function musicEnvelope(
  spans,
  totalFrames,
  { base = MIX.music, ducked = MIX.musicDucked, attack = 8, release = 14 } = {},
) {
  const points = [[0, base]];
  for (const [start, end] of speechSpans(spans, attack + release)) {
    const s = Math.max(0, start);
    const e = Math.min(totalFrames, end);
    if (e <= s) continue;
    points.push([Math.max(0, s - attack), base], [s, ducked], [e, ducked]);
    points.push([e + release, base]);
  }
  points.push([totalFrames, base]);
  const frames = [];
  const volumes = [];
  for (const [frame, volume] of points) {
    if (frame > totalFrames) continue;
    const at = frames.length - 1;
    if (at >= 0 && frame <= frames[at]) {
      // Same frame: the later (ducked) value wins, so speech is never under a loud bed.
      volumes[at] = Math.min(volumes[at], volume);
      continue;
    }
    frames.push(frame);
    volumes.push(volume);
  }
  return { frames, volumes };
}

/** True when any speaking span overlaps [start, end). */
export const speaks = (spans, start, end) =>
  spans.some(([s, e]) => s < end && e > start);
