/** Edit decisions for the Workshop film: transitions, scene lengths and the music mix. */

export const WORKSHOP_TRANSITIONS = ["crossfade", "slide", "zoom", "wipe"];
const ALL_TRANSITIONS = new Set([...WORKSHOP_TRANSITIONS, "cut"]);
const MAX_TRANSITION_FRAMES = 15;

export const MIX = {
  music: 0.2,
  musicDucked: 0.06,
  clipSolo: 0.9,
  clipUnderSpeech: 0.15,
  // Each effect arrives normalized to EFFECT_LUFS (sound-prep.mjs): its hit lands just under
  // the voice between lines and about 6 dB lower under a line.
  effects: 0.7,
  effectsDucked: 0.35,
};

/**
 * Integrated loudness the music bed is brought to before the gains. A typical ElevenLabs
 * track sits here, so a film without sound design keeps the level it had.
 */
export const MUSIC_LUFS = -17;
/** Each sound effect's loudest moment (momentary LUFS) after normalization. */
export const EFFECT_LUFS = -14;
/** The narration's loudness when it cannot be measured (an ElevenLabs take reads about -19). */
export const VOICE_LUFS = -19;

/**
 * The trailer mix of a film with sound design: the bed comes up to about -21.5 LUFS when
 * nobody speaks (title, long pauses, end card) and sits 13.5 dB under the voice while she
 * speaks. A pause shorter than a second keeps the bed down, so it does not pump.
 */
export const TRAILER = {
  bedLufs: -21.5,
  underVoiceDb: 13.5,
  attack: 6,
  release: 12,
  hold: 12,
};

const dbGain = (db) => Math.round(10 ** (db / 20) * 1000) / 1000;

/**
 * The film's mix: today's MIX for an ordinary film, the trailer profile when the film has
 * sound design. `voiceLufs` (the measured narration) sets how far the bed dips under it.
 */
export function mixProfile({ trailer = false, voiceLufs = null } = {}) {
  const base = { ...MIX, trailer: false, attack: 8, release: 14, hold: 0 };
  if (!trailer) return base;
  const voice = Number.isFinite(voiceLufs)
    ? Math.min(-12, Math.max(-30, voiceLufs))
    : VOICE_LUFS;
  const music = dbGain(TRAILER.bedLufs - MUSIC_LUFS);
  return {
    ...base,
    trailer: true,
    music,
    musicDucked: Math.min(
      music,
      dbGain(voice - TRAILER.underVoiceDb - MUSIC_LUFS),
    ),
    attack: TRAILER.attack,
    release: TRAILER.release,
    hold: TRAILER.hold,
  };
}

/** Frames over which one copy of a looped music bed hands over to the next. */
export const MUSIC_CROSSFADE = 45;
/** Frames of the film's closing fade, where the music bed fades out with the picture. */
export const MUSIC_END_FADE = 45;

/**
 * Copies of the music laid end to end until the bed covers the whole film. Each copy plays the
 * track from its start; a copy that hands over ends at the track's musical end (`bodyFrames`,
 * before its outro dies away) with an equal-power crossfade into the next one. The last copy
 * runs to the film's end, where the film's own fade takes it out; up to `outro` frames of the
 * track's own ending may play before that fade instead of a new copy starting. A track that
 * already covers the film is one copy, as before.
 */
export function musicLoops(
  musicFrames,
  totalFrames,
  {
    bodyFrames = musicFrames,
    crossfade = MUSIC_CROSSFADE,
    endFade = MUSIC_END_FADE,
    outro = 30,
  } = {},
) {
  if (!(musicFrames > 0) || !(totalFrames > 0)) return [];
  const body = Math.max(
    1,
    Math.min(musicFrames, Math.round(bodyFrames) || musicFrames),
  );
  const fade = Math.max(0, Math.min(crossfade, Math.floor(body / 3)));
  const ending = Math.min(outro, musicFrames - body);
  const loops = [];
  let start = 0;
  for (;;) {
    // The last copy reaches the film's fade with its body (or a short outro) and lasts to the
    // film's final frame.
    const last =
      (start + body + ending >= totalFrames - endFade &&
        start + musicFrames >= totalFrames) ||
      loops.length >= 49;
    loops.push({
      startFrame: start,
      frameCount: last
        ? Math.min(Math.floor(musicFrames), totalFrames - start)
        : body,
      fadeInFrames: loops.length ? fade : 0,
      fadeOutFrames: last ? 0 : fade,
    });
    if (last) return loops;
    start += body - fade;
  }
}

/** Seconds a whoosh plays before the cut it marks: its swell passes at the cut. */
export const WHOOSH_LEAD = 0.4;

/**
 * When each sound effect plays, in frames: a low impact on the opening title and on the end
 * card, a whoosh building into every cut (centred on the cut's transition). Each cue lasts its
 * effect's length and never runs past the film.
 */
export function effectCues(
  scenes,
  {
    fps,
    totalFrames,
    whoosh = null,
    impact = null,
    whooshFrames = 0,
    impactFrames = 0,
    endCardStart = null,
  },
) {
  const cues = [];
  const add = (file, start, length) => {
    const startFrame = Math.max(0, Math.round(start));
    const frameCount = Math.min(Math.max(1, length), totalFrames - startFrame);
    if (file && frameCount > 0) cues.push({ file, startFrame, frameCount });
  };
  const whooshLength = whooshFrames || Math.round(fps * 1.2);
  const impactLength = impactFrames || Math.round(fps * 2.5);
  if (impact) add(impact, 0, impactLength);
  if (whoosh)
    for (const scene of scenes.slice(1))
      add(
        whoosh,
        scene.startFrame -
          Math.round((scene.transitionFrames ?? 0) / 2) -
          Math.min(Math.round(fps * WHOOSH_LEAD), Math.round(whooshLength / 2)),
        whooshLength,
      );
  if (impact && Number.isInteger(endCardStart))
    add(impact, endCardStart - Math.round(fps * 0.2), impactLength);
  return cues.sort((a, b) => a.startFrame - b.startFrame);
}

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
 * Pauses shorter than the ramps (plus `hold`) keep the bed down.
 */
export function musicEnvelope(
  spans,
  totalFrames,
  {
    base = MIX.music,
    ducked = MIX.musicDucked,
    attack = 8,
    release = 14,
    hold = 0,
  } = {},
) {
  const points = [[0, base]];
  for (const [start, end] of speechSpans(spans, attack + release + hold)) {
    const s = Math.max(0, start);
    const e = Math.min(totalFrames, end);
    if (e <= s) continue;
    // Speech from the first frames: the film opens already under the voice.
    points.push(
      s - attack > 0 ? [s - attack, base] : [0, ducked],
      [s, ducked],
      [e, ducked],
    );
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

/** A kicker title (the scene's own short title over karaoke captions) stays this short. */
export const KICKER_MAX_WORDS = 5;
export const KICKER_MAX_CHARS = 32;

/** Words for comparing a title with a spoken line: no niqqud, punctuation or case. */
const plainWords = (text) =>
  String(text ?? "")
    .normalize("NFC")
    .replace(/[\u0591-\u05C7]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

const contains = (outer, inner) =>
  ` ${outer.join(" ")} `.includes(` ${inner.join(" ")} `);

/**
 * The scene's title to show as a kicker above karaoke captions ("אנליסטית", "SEO ו-GEO"), or
 * null: only a short title (at most five words and 32 characters) that is not just the scene's
 * spoken line again. A title that is most of the line, or the whole line, would only repeat
 * the captions under it.
 */
export function kickerTitle(caption, line = "") {
  const text = String(caption ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text.length > KICKER_MAX_CHARS) return null;
  if (text.split(" ").length > KICKER_MAX_WORDS) return null;
  const title = plainWords(text);
  if (!title.length) return null;
  const spoken = plainWords(line);
  if (
    spoken.length &&
    (contains(title, spoken) ||
      (contains(spoken, title) && title.length * 5 >= spoken.length * 3))
  )
    return null;
  return text;
}
