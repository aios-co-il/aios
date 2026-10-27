import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { assembleFilm } from "../src/compose/assemble.mjs";
import { buildTimeline } from "../src/compose/timeline.mjs";
import {
  filmSoundEffects,
  soundEffectsCostUsd,
} from "../src/jobs/sound-effects.mjs";
import { renderFilm } from "../src/jobs/render.mjs";

const TENANT = "11111111-1111-1111-1111-111111111111";
const ITEM = "22222222-2222-2222-2222-222222222222";
const run = () => ({
  id: "run-1",
  tenant_id: TENANT,
  item_id: ITEM,
  stage_id: "stage-1",
  output: {},
});

const hasFfmpeg =
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const media = (args) => {
  const result = spawnSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...args,
  ]);
  if (result.status !== 0) throw new Error(String(result.stderr));
};
const colorClip = (file, color) => {
  const picture = `color=c=${color}:s=320x240:d=2`;
  media(["-f", "lavfi", "-i", picture, "-pix_fmt", "yuv420p", file]);
  return file;
};
const loudness = (file, from, length) => {
  const out = spawnSync(
    "ffmpeg",
    [
      "-ss",
      String(from),
      "-t",
      String(length),
      "-i",
      file,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  return Number(out.stderr.match(/mean_volume:\s*(-?[0-9.]+) dB/)?.[1] ?? -91);
};

test.skipIf(!hasFfmpeg)(
  "a sample film renders with a whoosh at the cut and an impact on the title",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "sfx-"));
    try {
      const clip = (name, color) => colorClip(join(dir, `${name}.mp4`), color);
      const whoosh = join(dir, "whoosh.wav");
      const impact = join(dir, "impact.wav");
      media(["-f", "lavfi", "-i", "anoisesrc=d=0.6:c=pink:a=0.6", whoosh]);
      media([
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=60:duration=0.8",
        "-af",
        "volume=0.9",
        impact,
      ]);
      const scenes = [
        { id: "a", position: 1, clipPath: clip("a", "red"), durationS: 2 },
        { id: "b", position: 2, clipPath: clip("b", "blue"), durationS: 2 },
      ];
      const output = join(dir, "film.mp4");
      await assembleFilm(
        buildTimeline(scenes, {
          effects: { whooshPath: whoosh, impactPath: impact },
        }),
        output,
      );
      const silent = join(dir, "silent.mp4");
      await assembleFilm(buildTimeline(scenes, {}), silent);
      // The whoosh starts 0.4 s before the cut at 2 s; the impact opens the film.
      expect(loudness(output, 1.65, 0.3)).toBeGreaterThan(-40);
      expect(loudness(output, 0, 0.5)).toBeGreaterThan(-40);
      expect(loudness(output, 3.0, 0.8)).toBeLessThan(-60);
      expect(loudness(silent, 1.65, 0.3)).toBeLessThan(-60);
      // Under a narration the effects are compressed by the voice (sidechain), not removed.
      const voice = join(dir, "voice.wav");
      media([
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=300:duration=4",
        "-af",
        "volume=0.5",
        voice,
      ]);
      const narrated = join(dir, "narrated.mp4");
      await assembleFilm(
        buildTimeline(scenes, {
          narrationPath: voice,
          effects: { whooshPath: whoosh, impactPath: impact },
        }),
        narrated,
      );
      const voiceOnly = join(dir, "voice-only.mp4");
      await assembleFilm(
        buildTimeline(scenes, { narrationPath: voice }),
        voiceOnly,
      );
      const lift =
        loudness(narrated, 1.65, 0.3) - loudness(voiceOnly, 1.65, 0.3);
      expect(lift).toBeGreaterThan(0);
      expect(lift).toBeLessThan(
        loudness(output, 1.65, 0.3) - loudness(silent, 1.65, 0.3),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);

/** A database for one render: two scenes with clips in the tenant's folder. */
function renderDb(dir, payload) {
  const stored = new Map();
  const calls = { uploads: [], inserts: [] };
  const clipPath = (id) => `${TENANT}/general/${ITEM}/${id}.mp4`;
  return {
    calls,
    stored,
    async select(table, query) {
      if (table === "marketing_work_items")
        return query.includes("select=payload")
          ? [{ payload }]
          : [{ id: ITEM, tenant_id: TENANT, client_id: null }];
      if (table === "marketing_video_scenes")
        return ["c1", "c2"].map((clip, index) => ({
          id: `s${index + 1}`,
          position: index + 1,
          overlay_text: "",
          voiceover_text: "",
          duration_s: 2,
          clip_asset_id: clip,
          meta: {},
        }));
      if (table === "marketing_assets" && query.startsWith("id=in."))
        return ["c1", "c2"].map((id) => ({
          id,
          type: "clip",
          url: clipPath(id),
          meta: { provider: "kling" },
        }));
      return [];
    },
    async download(_bucket, path) {
      if (stored.has(path)) return stored.get(path);
      return new Uint8Array(await readFile(join(dir, path.split("/").pop())));
    },
    async upload(_bucket, path, bytes) {
      stored.set(path, new Uint8Array(bytes));
      calls.uploads.push(path);
    },
    async update() {},
    async insert(table, row) {
      calls.inserts.push({ table, row });
    },
  };
}

test.skipIf(!hasFfmpeg)(
  "a trailer brief renders the film with its effects, and without a key renders it without",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "sfx-render-"));
    const remotion = process.env.REMOTION_DISABLE;
    process.env.REMOTION_DISABLE = "1";
    try {
      colorClip(join(dir, "c1.mp4"), "red");
      colorClip(join(dir, "c2.mp4"), "blue");
      media([
        "-f",
        "lavfi",
        "-i",
        "anoisesrc=d=0.6:c=pink:a=0.6",
        join(dir, "fx.wav"),
      ]);
      const fx = new Uint8Array(await readFile(join(dir, "fx.wav")));
      const db = renderDb(dir, { video: { sound_design: true } });
      const done = await renderFilm({
        db,
        run: run(),
        resolveElevenLabsKey: async () => "xi-key",
        makeEffects: (input) =>
          filmSoundEffects({ ...input, generate: async () => fx }),
        log: () => {},
      });
      expect(done.output.sound_effects_error).toBe(null);
      expect(Object.keys(done.output.sound_effects)).toStrictEqual([
        "whoosh",
        "impact",
      ]);
      expect(done.costUsd).toBe(soundEffectsCostUsd(["whoosh", "impact"]));
      const film = join(dir, "film.mp4");
      await writeFile(film, db.stored.get(done.output.path));
      expect(loudness(film, 1.65, 0.3)).toBeGreaterThan(-40);

      const keyless = renderDb(dir, { video: { sound_design: true } });
      const plain = await renderFilm({
        db: keyless,
        run: run(),
        log: () => {},
      });
      expect(plain.output.sound_effects_error).toMatch(/אין מפתח ElevenLabs/);
      expect(plain.costUsd).toBe(0);
      expect(keyless.stored.has(plain.output.path)).toBe(true);

      let asked = 0;
      const quiet = await renderFilm({
        db: renderDb(dir, { video: {} }),
        run: run(),
        makeEffects: async () => {
          asked += 1;
          return { paths: {}, costUsd: 0, error: null };
        },
        log: () => {},
      });
      expect(asked).toBe(0);
      expect("sound_effects_error" in quiet.output).toBe(false);
    } finally {
      if (remotion === undefined) delete process.env.REMOTION_DISABLE;
      else process.env.REMOTION_DISABLE = remotion;
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);
