/**
 * How long the film's music bed must be: the film that will be rendered, not the storyboard's
 * planned scene total. The narration usually runs longer than the plan (each scene lasts until
 * the next line starts), and the end card follows the scenes. So the bed is sized with the same
 * fitting the edit uses (workshop-manifest.mjs) on the narration's word timings, plus the end
 * card and a tail. A narration still being made is waited for, for a short while; without it
 * the planned length gets headroom. The render loops a bed that still comes out short.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brandFromPayload } from "../compose/brand.mjs";
import { wordsFromAlignment } from "../compose/captions.mjs";
import { ctaLines, endCardSeconds, hasEndCard } from "../compose/end-card.mjs";
import { sceneSeconds } from "../compose/timeline.mjs";
import {
  WORKSHOP_FPS,
  lastEnd,
  narratedSceneFrames,
  sceneMinFrames,
} from "../compose/workshop-manifest.mjs";
import { assertTenantPath } from "../guard.mjs";
import { probe } from "../ffmpeg.mjs";
import { isTalkingScene, joinNarration, narrationLine } from "../narration.mjs";

const BUCKET = "creative-video";
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

const clampMs = (ms) =>
  Math.min(MUSIC_MAX_MS, Math.max(MUSIC_MIN_MS, Math.round(ms)));

const inList = (ids) => `(${ids.map(encodeURIComponent).join(",")})`;

const metaOf = (row) => {
  const meta = row?.meta;
  if (typeof meta !== "string") return meta ?? {};
  try {
    return JSON.parse(meta);
  } catch {
    return {};
  }
};

/** Seconds of a stored narration without word timings: downloaded and probed. */
async function probeStored(db, tenantId, path) {
  const dir = await mkdtemp(join(tmpdir(), "music-length-"));
  try {
    const file = join(dir, "narration.audio");
    await writeFile(
      file,
      await db.download(BUCKET, assertTenantPath(tenantId, path)),
    );
    return (await probe(file)).duration || 0;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** What the film is made of now: its scenes, the narration take, scene voices, pending voices. */
async function readFilm(db, run, probeNarration) {
  const item = `item_id=eq.${run.item_id}&tenant_id=eq.${run.tenant_id}`;
  const scenes =
    (await db.select(
      "marketing_video_scenes",
      `${item}&select=id,position,duration_s,voiceover_text,voice_asset_id,meta&order=position`,
    )) ?? [];
  const talking = scenes.some(isTalkingScene);
  const script = joinNarration(scenes.map(narrationLine));
  let narration = null;
  if (script && !talking) {
    const [take] =
      (await db.select(
        "marketing_assets",
        `${item}&type=eq.narration&url=not.is.null&select=url,meta&order=created_at.desc&limit=1`,
      )) ?? [];
    // Only the take of this script; an older one would size a different film.
    if (take && String(metaOf(take).text ?? "") === script) {
      const words = wordsFromAlignment(metaOf(take).alignment);
      const seconds = words.length
        ? lastEnd(words)
        : await probeNarration(take.url).catch(() => 0);
      if (seconds > 0) narration = { words, seconds };
    }
  }
  const voiceIds = scenes.map((scene) => scene.voice_asset_id).filter(Boolean);
  const voices = new Map();
  if (voiceIds.length) {
    const rows =
      (await db.select(
        "marketing_assets",
        `id=in.${inList(voiceIds)}&tenant_id=eq.${run.tenant_id}&select=id,type,meta`,
      )) ?? [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const scene of scenes) {
      const voice = byId.get(scene.voice_asset_id);
      // A scene's own voice (a talking film); a continuous take linked here is the whole script.
      if (voice?.type !== "voiceover") continue;
      const seconds = lastEnd(wordsFromAlignment(metaOf(voice).alignment));
      if (seconds > 0) voices.set(scene.id, seconds);
    }
  }
  const pending =
    (await db.select(
      "marketing_runs",
      `${item}&kind=eq.voice&status=in.(queued,running)&select=id&limit=1`,
    )) ?? [];
  return {
    scenes,
    narration,
    voices,
    // A continuous take will be laid over the film, but its length is not known yet.
    expectsNarration: Boolean(script) && !talking,
    pending: pending.length > 0,
  };
}

/** Seconds the end card adds after the scenes (end-card.mjs), from the item's brand kit. */
async function endCardS(db, run) {
  const [row] =
    (await db.select(
      "marketing_work_items",
      `id=eq.${encodeURIComponent(run.item_id)}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}&select=payload`,
    )) ?? [];
  const brand = brandFromPayload(row?.payload);
  return brand && hasEndCard({ ...brand, logoPath: brand.logoUrl })
    ? endCardSeconds(ctaLines(brand.ctaText))
    : 0;
}

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
  probeNarration = (path) => probeStored(db, run.tenant_id, path),
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
