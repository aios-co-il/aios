/**
 * Path of the rolling orb, as pure geometry: built from measured heading
 * positions, then sampled by scroll position. All y values are page
 * coordinates; x values are viewport coordinates (the page never scrolls
 * sideways).
 */

export interface TrackLine {
  /** Left and right ends of the heading's first line of text. */
  left: number;
  right: number;
  /** Top of the first line of text. */
  top: number;
}

export interface Point {
  x: number;
  y: number;
}

interface Segment {
  kind: "roll" | "fall";
  fromScroll: number;
  toScroll: number;
  from: Point;
  to: Point;
}

export interface OrbPose {
  x: number;
  y: number;
  /** 1 = round; below 1 = squashed on landing. */
  squash: number;
}

/** Scroll distance spent falling from the header to the first heading. */
const FIRST_DROP_SCROLL = 120;
/** A heading's screen position (share of viewport height) as a roll starts and ends. */
const ROLL_FROM = 0.65;
const ROLL_TO = 0.35;
/** Least scroll distance kept for each fall. */
const MIN_FALL_SCROLL = 120;
/** Share of a fall spent bouncing after the landing. */
const BOUNCE_SHARE = 0.18;

/**
 * Builds the path: drop from `home` onto the first heading, then for each
 * heading roll along its top (alternating direction) while it crosses the
 * middle of the screen, and fall onto the next one.
 */
export function buildPath(
  home: Point,
  tracks: Array<TrackLine>,
  radius: number,
  viewportHeight: number,
): Array<Segment> {
  const lines = tracks.map((track, index) => trackEnds(track, index, radius));
  const segments: Array<Segment> = [];
  let cursor = 0;
  let from: Point = home;
  lines.forEach((line, index) => {
    const top = tracks[index].top;
    const rollStart = Math.max(
      top - viewportHeight * ROLL_FROM,
      cursor + (index === 0 ? FIRST_DROP_SCROLL : MIN_FALL_SCROLL),
    );
    segments.push({
      kind: "fall",
      fromScroll: cursor,
      toScroll: rollStart,
      from,
      to: line.start,
    });
    const rollEnd = Math.max(
      top - viewportHeight * ROLL_TO,
      rollStart + MIN_FALL_SCROLL,
    );
    segments.push({
      kind: "roll",
      fromScroll: rollStart,
      toScroll: rollEnd,
      from: line.start,
      to: line.end,
    });
    cursor = rollEnd;
    from = line.end;
  });
  return segments;
}

/** The orb's position and squash at `scroll`. */
export function poseAt(segments: Array<Segment>, scroll: number): OrbPose {
  const segment =
    segments.find((item) => scroll < item.toScroll) ??
    segments[segments.length - 1];
  const span = Math.max(segment.toScroll - segment.fromScroll, 1);
  const t = clamp((scroll - segment.fromScroll) / span, 0, 1);
  return segment.kind === "roll"
    ? { ...lerpPoint(segment.from, segment.to, easeInOut(t)), squash: 1 }
    : fallPose(segment, t, scroll);
}

/** Start and end of the roll on one heading; even headings roll right to left. */
function trackEnds(track: TrackLine, index: number, radius: number) {
  const y = track.top - radius;
  const right = { x: track.right - radius, y };
  const left = { x: track.left + radius, y };
  return index % 2 === 0
    ? { start: right, end: left }
    : { start: left, end: right };
}

/**
 * Gravity fall to the landing point, then a small bounce with a squash.
 * Worked out in screen space, so the orb drops down the screen even while
 * the page scrolls up under it.
 */
function fallPose(segment: Segment, t: number, scroll: number): OrbPose {
  const { from, to } = segment;
  const startY = from.y - segment.fromScroll;
  const endY = to.y - segment.toScroll;
  const dropEnd = 1 - BOUNCE_SHARE;
  if (t < dropEnd) {
    const u = t / dropEnd;
    return {
      x: from.x + (to.x - from.x) * easeOut(u),
      y: startY + (endY - startY) * u * u + scroll,
      squash: 1,
    };
  }
  const u = (t - dropEnd) / BOUNCE_SHARE;
  const height = Math.min(26, Math.abs(endY - startY) * 0.1);
  return {
    x: to.x,
    y: endY - height * Math.sin(Math.PI * u) + scroll,
    squash: 1 - 0.18 * Math.max(0, 1 - u * 4),
  };
}

/** Linear blend between two points. */
function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Smooth start and stop. */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Fast start, gentle stop. */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 2;
}

/** Keeps `value` within `min`..`max`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
