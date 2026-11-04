// Pure helpers for turning ffmpeg scene-change times into shots.

/** pts_time values from ffmpeg `showinfo` output (one per selected frame). */
export function parseShowinfoTimes(stderr) {
  const times = [];
  for (const match of stderr.matchAll(/pts_time:\s*([0-9]+(?:\.[0-9]+)?)/g)) {
    times.push(Number(match[1]));
  }
  return times;
}

/**
 * Shots from cut times. Cuts closer than `minShot` seconds to the previous boundary
 * (flashes, fades) are dropped so every shot is long enough to read.
 */
export function buildShots(
  cuts,
  duration,
  { minShot = 0.6, maxShots = 24 } = {},
) {
  const end =
    Number.isFinite(duration) && duration > 0 ? duration : Math.max(0, ...cuts);
  const boundaries = [0];
  for (const cut of [...cuts].sort((a, b) => a - b)) {
    if (cut <= 0 || cut >= end) continue;
    if (cut - boundaries[boundaries.length - 1] < minShot) continue;
    if (end - cut < minShot) continue;
    boundaries.push(cut);
  }
  boundaries.push(end);
  let shots = boundaries.slice(0, -1).map((start, index) => ({
    index: index + 1,
    start: round(start),
    end: round(boundaries[index + 1]),
    duration: round(boundaries[index + 1] - start),
  }));
  // Very busy edits: merge the shortest neighbours until the storyboard stays usable.
  while (shots.length > maxShots) {
    let shortest = 0;
    for (let index = 1; index < shots.length; index += 1) {
      if (shots[index].duration < shots[shortest].duration) shortest = index;
    }
    const neighbour =
      shortest === shots.length - 1 ? shortest - 1 : shortest + 1;
    const [a, b] = [
      Math.min(shortest, neighbour),
      Math.max(shortest, neighbour),
    ];
    const merged = {
      start: shots[a].start,
      end: shots[b].end,
      duration: round(shots[b].end - shots[a].start),
    };
    shots.splice(a, 2, { index: 0, ...merged });
    shots = shots.map((shot, index) => ({ ...shot, index: index + 1 }));
  }
  return shots;
}

/** Midpoint of a shot, where a representative keyframe is taken. */
export const keyframeTime = (shot) => round(shot.start + shot.duration / 2);

/** Transcript words that fall inside a shot, joined. */
export function shotTranscript(words, shot) {
  return words
    .filter(
      (word) =>
        word.type !== "spacing" &&
        word.start >= shot.start - 0.05 &&
        word.start < shot.end,
    )
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+([,.!?:;])/g, "$1")
    .trim();
}

const round = (value) => Math.round(value * 100) / 100;
