/**
 * Which transition sound plays at each cut of a film with sound design. The film has a set of
 * different sounds (jobs/sound-effects-catalog.mjs) and its cuts go through them in a shuffled
 * order: each sound plays once before any plays again, and no two cuts in a row get the same
 * one. The order is drawn from the film's id, so every render of the film sounds the same. Both
 * edits use it: the Remotion manifest (workshop-manifest.mjs) and the ffmpeg concat
 * (assemble.mjs).
 */

/** Repeatable numbers in [0, 1) drawn from `seed` (FNV-1a of the text, then mulberry32). */
function seeded(seed) {
  let state = 2166136261;
  for (const char of String(seed ?? "")) {
    state ^= char.codePointAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The sound for each of `cuts` cuts, as an index into the film's `sounds` transition sounds:
 * rounds of every sound in a shuffled order, a round never opening with the sound the last one
 * closed on. One sound plays at every cut; no sounds or no cuts give an empty list.
 */
export function cutSoundOrder(sounds, cuts, seed = "") {
  if (!(sounds > 0) || !(cuts > 0)) return [];
  const next = seeded(seed);
  const order = [];
  while (order.length < cuts) {
    const round = Array.from({ length: sounds }, (_, index) => index);
    for (let i = sounds - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [round[i], round[j]] = [round[j], round[i]];
    }
    if (sounds > 1 && round[0] === order.at(-1)) {
      const j = 1 + Math.floor(next() * (sounds - 1));
      [round[0], round[j]] = [round[j], round[0]];
    }
    order.push(...round);
  }
  return order.slice(0, cuts);
}
