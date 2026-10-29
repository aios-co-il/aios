/**
 * What the music job reads to size the bed (music-length.mjs): the film as it stands while the
 * production runs, for the run's tenant. Every scene counts, since their clips are still being
 * made; the narration take only when it is of the current script; a scene's own voice only in a
 * talking film and only of its current line, as the render picks it (render.mjs ownVoice).
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brandFromPayload } from "../compose/brand.mjs";
import { wordsFromAlignment } from "../compose/captions.mjs";
import { ctaLines, endCardSeconds, hasEndCard } from "../compose/end-card.mjs";
import { lastEnd } from "../compose/workshop-manifest.mjs";
import { probe } from "../ffmpeg.mjs";
import { assertTenantPath } from "../guard.mjs";
import {
  isTalkingScene,
  joinNarration,
  narrationLine,
  talkingLine,
} from "../narration.mjs";
import { inList, metaOf } from "./rows.mjs";

const BUCKET = "creative-video";

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
export async function readFilm(
  db,
  run,
  probeNarration = (path) => probeStored(db, run.tenant_id, path),
) {
  const item = `item_id=eq.${encodeURIComponent(run.item_id)}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}`;
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
  // Scene voices only time a talking film, which is narrated scene by scene; any other film
  // is cut to its continuous take (or still waits for it).
  const voiceIds = talking
    ? scenes.map((scene) => scene.voice_asset_id).filter(Boolean)
    : [];
  const voices = new Map();
  if (voiceIds.length) {
    const rows =
      (await db.select(
        "marketing_assets",
        `id=in.${inList(voiceIds)}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}&select=id,type,meta`,
      )) ?? [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const scene of scenes) {
      const voice = byId.get(scene.voice_asset_id);
      const line = isTalkingScene(scene)
        ? talkingLine(scene)
        : narrationLine(scene);
      // Like the render (render.mjs ownVoice): a scene's own voiceover of its current line.
      if (
        voice?.type !== "voiceover" ||
        !line ||
        String(metaOf(voice).text ?? "") !== line
      )
        continue;
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
export async function endCardS(db, run) {
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
