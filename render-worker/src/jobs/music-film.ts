/**
 * What the music job reads to size the bed (music-length.ts): the film as it stands while the
 * production runs, for the run's tenant. Every scene counts, since their clips are still being
 * made; the narration take only when it is of the current script; a scene's own voice only in a
 * talking film and only of its current line, as the render picks it (render.ts ownVoice).
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brandFromPayload } from "../compose/brand.ts";
import { wordsFromAlignment } from "../compose/captions.ts";
import { ctaLines, endCardSeconds, hasEndCard } from "../compose/end-card.ts";
import { lastEnd } from "../compose/manifest-media.ts";
import { probe } from "../ffmpeg.ts";
import { assertTenantPath } from "../guard.ts";
import {
  isTalkingScene,
  joinNarration,
  narrationLine,
  talkingLine,
} from "../narration.ts";
import { inList, metaOf, rowsOf } from "./rows.ts";
import type { AssetRow, PayloadRow, SceneRow, VideoRun } from "./types.ts";
import type { TimedWord } from "../compose/types.ts";
import type { SupabaseRest } from "../supabaseRest.ts";

const BUCKET = "creative-video";

/** Seconds of a stored narration without word timings: downloaded and probed. */
async function probeStored(
  db: Pick<SupabaseRest, "download">,
  tenantId: string,
  path: unknown,
) {
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
  db: Pick<SupabaseRest, "select" | "download">,
  run: Pick<VideoRun, "item_id" | "tenant_id">,
  probeNarration: (path: unknown) => Promise<number> = (path) =>
    probeStored(db, run.tenant_id, path),
): Promise<FilmNow> {
  const item = `item_id=eq.${encodeURIComponent(String(run.item_id))}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}`;
  const scenes = rowsOf<SceneRow>(
    await db.select(
      "marketing_video_scenes",
      `${item}&select=id,position,duration_s,voiceover_text,voice_asset_id,meta&order=position`,
    ),
  );
  const talking = scenes.some(isTalkingScene);
  const script = joinNarration(scenes.map(narrationLine));
  let narration: FilmNow["narration"] = null;
  if (script && !talking) {
    const [take] = rowsOf<Pick<AssetRow, "url" | "meta">>(
      await db.select(
        "marketing_assets",
        `${item}&type=eq.narration&url=not.is.null&select=url,meta&order=created_at.desc&limit=1`,
      ),
    );
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
    ? scenes
        .map((scene) => scene.voice_asset_id)
        .filter((id): id is string => Boolean(id))
    : [];
  const voices = new Map<string, number>();
  if (voiceIds.length) {
    const rows = rowsOf<AssetRow>(
      await db.select(
        "marketing_assets",
        `id=in.${inList(voiceIds)}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}&select=id,type,meta`,
      ),
    );
    const byId = new Map<string, AssetRow>(rows.map((row) => [row.id, row]));
    for (const scene of scenes) {
      const voice = scene.voice_asset_id
        ? byId.get(scene.voice_asset_id)
        : undefined;
      const line = isTalkingScene(scene)
        ? talkingLine(scene)
        : narrationLine(scene);
      // Like the render (render.ts ownVoice): a scene's own voiceover of its current line.
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
  const pending = rowsOf<{ id: string }>(
    await db.select(
      "marketing_runs",
      `${item}&kind=eq.voice&status=in.(queued,running)&select=id&limit=1`,
    ),
  );
  return {
    scenes,
    narration,
    voices,
    // A continuous take will be laid over the film, but its length is not known yet.
    expectsNarration: Boolean(script) && !talking,
    pending: pending.length > 0,
  };
}

/** Seconds the end card adds after the scenes (end-card.ts), from the item's brand kit. */
export async function endCardS(
  db: Pick<SupabaseRest, "select">,
  run: Pick<VideoRun, "item_id" | "tenant_id">,
) {
  const [row] = rowsOf<PayloadRow>(
    await db.select(
      "marketing_work_items",
      `id=eq.${encodeURIComponent(String(run.item_id))}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}&select=payload`,
    ),
  );
  const brand = brandFromPayload(row?.payload);
  return brand && hasEndCard({ ...brand, logoPath: brand.logoUrl })
    ? endCardSeconds(ctaLines(brand.ctaText))
    : 0;
}

/** The film as it stands while the production runs (readFilm). */
export interface FilmNow {
  scenes: Array<SceneRow>;
  /** The narration take of the current script: its words and length. */
  narration: { words: Array<TimedWord>; seconds: number } | null;
  /** Seconds of each talking scene's own voice, by scene id. */
  voices: Map<string, number>;
  expectsNarration: boolean;
  pending: boolean;
}
