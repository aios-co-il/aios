/**
 * How long the film's music bed must be: the film that will be rendered, not the storyboard's
 * planned scene total. The narration usually runs longer than the plan (each scene lasts until
 * the next line starts), and the end card follows the scenes. So the bed is sized with the same
 * fitting the edit uses (workshop-manifest.mjs) on the narration's word timings, plus the end
 * card and a tail. A narration still being made is waited for, for a short while; without it
 * the planned length gets headroom. The request never passes the run's quote (quotedMusicMs),
 * and the render loops a bed that still comes out short.
 */
import { sceneSeconds } from "../compose/timeline.mjs";
import {
  WORKSHOP_FPS,
  narratedSceneFrames,
  sceneMinFrames,
} from "../compose/workshop-manifest.mjs";
import { narrationLine } from "../narration.mjs";
import { endCardS, readFilm } from "./music-film.mjs";

/** ElevenLabs music lengths. */
export const MUSIC_MIN_MS = 3_000;
export const MUSIC_MAX_MS = 300_000;
/**
 * Seconds of music past the film. An ElevenLabs piece ends on its own outro (the showcase
 * track spent its last 4.4 s dying away), so the bed asks for its fade-out room (1.5 s) and
 * most of that outro, and the music is still full when the film fades.
 */
export const MUSIC_TAIL_S = 4;
/** Extra share of the planned length while the narration's length is not known. */
export const PLANNED_HEADROOM = 0.15;
/** How long the music run waits for a narration that is being made. */
export const NARRATION_WAIT_MS = 120_000;
const POLL_MS = 5_000;
/**
 * ElevenLabs music list price, the rate the quote uses (clip-prices.ts MUSIC_USD_PER_MINUTE;
 * its musicQuoteSeconds prices the PLANNED_HEADROOM, the longest end card and MUSIC_TAIL_S).
 */
export const MUSIC_USD_PER_MINUTE = 0.5;

const clampMs = (ms) =>
  Math.min(MUSIC_MAX_MS, Math.max(MUSIC_MIN_MS, Math.round(ms)));

/**
 * The longest bed this run may pay for: what its quote (`input.estimate.usd`, approved before
 * any spend) buys at MUSIC_USD_PER_MINUTE, and never less than the planned length the run was
 * queued with (what it asked for before the bed was sized).
 */
export function quotedMusicMs(run) {
  const planned = clampMs(Number(run?.input?.music_length_ms) || 0);
  const usd = Number(run?.input?.estimate?.usd);
  const quoted =
    usd > 0 ? Math.floor((usd / MUSIC_USD_PER_MINUTE) * 60_000) : 0;
  return Math.max(planned, Math.min(MUSIC_MAX_MS, quoted));
}

/** What a bed of `ms` costs, the run's recorded charge. */
export const musicCostUsd = (ms) =>
  Math.round(
    (Math.max(0, Number(ms) || 0) / 60_000) * MUSIC_USD_PER_MINUTE * 10_000,
  ) / 10_000;

/**
 * The film's length in seconds (scenes and end card) and how it was found: "narration" (the
 * take's word timings fit the scenes as the edit does), "planned" (no continuous take: the
 * storyboard with each scene's own voice) or "headroom" (a take is due but not readable yet).
 */
export function filmSeconds({ scenes, narration, voices, expectsNarration }) {
  const fps = WORKSHOP_FPS;
  const minFrames = scenes.map((scene) =>
    sceneMinFrames(
      {
        durationS: sceneSeconds(scene.duration_s),
        voiceS: voices?.get(scene.id) ?? 0,
      },
      fps,
    ),
  );
  if (!minFrames.length) return { seconds: 0, basis: "planned" };
  const total = (frames) => frames.reduce((sum, n) => sum + n, 0) / fps;
  if (narration)
    return {
      seconds: total(
        narratedSceneFrames(minFrames, {
          lines: scenes.map(narrationLine),
          words: narration.words,
          narrationS: narration.seconds,
          fps,
        }),
      ),
      basis: "narration",
    };
  if (expectsNarration)
    return {
      seconds: total(minFrames) * (1 + PLANNED_HEADROOM),
      basis: "headroom",
    };
  return { seconds: total(minFrames), basis: "planned" };
}

/**
 * The music_length_ms to ask ElevenLabs for: the film (filmSeconds) plus its end card and
 * MUSIC_TAIL_S, within ElevenLabs' 3 s – 5 min. While a voice run is queued or running, the
 * narration is waited for up to `waitMs`.
 */
export async function musicLengthMs({
  db,
  run,
  waitMs = NARRATION_WAIT_MS,
  pollMs = POLL_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  probeNarration,
  log = console.log,
}) {
  const started = now();
  let film = await readFilm(db, run, probeNarration);
  while (!film.narration && film.pending && now() - started < waitMs) {
    log(`[music] ${run.id} waiting for the narration to size the bed`);
    await sleep(pollMs);
    film = await readFilm(db, run, probeNarration);
  }
  const { seconds, basis } = filmSeconds(film);
  const cardS = await endCardS(db, run);
  return {
    ms: clampMs((seconds + cardS + MUSIC_TAIL_S) * 1000),
    basis,
    filmS: Math.round((seconds + cardS) * 100) / 100,
  };
}
