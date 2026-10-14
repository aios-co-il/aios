import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleFilm } from "../compose/assemble.mjs";
import { buildTimeline } from "../compose/timeline.mjs";

const BUCKET = "creative-video";

async function materialize(db, url, file) {
  if (!url) return null;
  const bytes = /^https?:\/\//.test(url)
    ? new Uint8Array(await (await fetch(url)).arrayBuffer())
    : await db.download(BUCKET, url);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(file, bytes);
  return file;
}

/** Builds the finished MP4 from approved clips, their voiceovers and the music bed. */
export async function renderFilm({ db, run, log = console.log }) {
  const input = run.input ?? {};
  const scenes = Array.isArray(input.scenes) ? input.scenes : [];
  const dir = await mkdtemp(join(tmpdir(), "promo-"));
  try {
    const local = [];
    for (const [index, scene] of scenes.entries()) {
      local.push({
        ...scene,
        clipPath: await materialize(
          db,
          scene.clipPath,
          join(dir, `clip-${index}.mp4`),
        ),
        voicePath: scene.voicePath
          ? await materialize(
              db,
              scene.voicePath,
              join(dir, `voice-${index}.mp3`),
            )
          : null,
      });
    }
    const musicPath = input.musicPath
      ? await materialize(db, input.musicPath, join(dir, "music.mp3"))
      : null;
    const timeline = buildTimeline(local, {
      aspect: input.aspect || "9:16",
      musicPath,
    });
    const output = join(dir, "film.mp4");
    await assembleFilm(timeline, output);
    const bytes = await readFile(output);
    const version = Number(input.version) || 1;
    const path = `${run.tenant_id}/${input.client_id ?? "general"}/${run.item_id}/render/film-v${version}.mp4`;
    await db.upload(BUCKET, path, bytes, "video/mp4");
    await db.insert("marketing_assets", {
      tenant_id: run.tenant_id,
      item_id: run.item_id,
      run_id: run.id,
      stage_id: run.stage_id,
      type: "render",
      url: path,
      meta: {
        bucket: BUCKET,
        path,
        provider: "compose",
        duration_s: timeline.totalS,
        scene_count: timeline.scenes.length,
        aspect: timeline.aspect,
      },
    });
    log(`[render] ${run.id} stored ${path}`);
    return {
      output: {
        path,
        duration_s: timeline.totalS,
        scene_count: timeline.scenes.length,
      },
      provider: "compose",
      credits: 0,
      costUsd: 0,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
