import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { assembleFilm } from "../src/compose/assemble.mjs";
import { buildTimeline } from "../src/compose/timeline.mjs";
import { cutSoundPlan } from "../src/compose/transition-sounds.mjs";
import { SOUND_EFFECT_NAMES } from "../src/jobs/sound-effects-catalog.mjs";
import {
  OVER_QUOTE,
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
      // Under a narration the effects dip with the voice (the effects envelope), not removed.
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

/** Mean level (dB) of `file` over [from, from + length] in a narrow band around `hz`. */
const bandDb = (file, from, length, hz) => {
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
      `bandpass=f=${hz}:width_type=q:w=8,bandpass=f=${hz}:width_type=q:w=8,volumedetect`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  return Number(out.stderr.match(/mean_volume:\s*(-?[0-9.]+) dB/)?.[1] ?? -91);
};

test.skipIf(!hasFfmpeg)(
  "the ffmpeg edit plays a different transition sound at each cut, in the film's order",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "sfx-cuts-"));
    try {
      // Three sounds told apart by their pitch, six scenes of 1.5 s: five cuts, the last two
      // a second round, its sounds shifted down three semitones.
      const tones = [500, 1100, 2400];
      const sounds = tones.map((hz) => {
        const file = join(dir, `t${hz}.wav`);
        media([
          "-f",
          "lavfi",
          "-i",
          `sine=frequency=${hz}:duration=0.6`,
          "-af",
          "volume=2",
          file,
        ]);
        return file;
      });
      const clip = (name, color) => colorClip(join(dir, `${name}.mp4`), color);
      const colors = ["red", "blue", "green", "white", "yellow", "black"];
      const scenes = colors.map((color, index) => ({
        id: color,
        position: index + 1,
        clipPath: clip(color, color),
        durationS: 1.5,
      }));
      const seed = "film-7";
      const output = join(dir, "film.mp4");
      await assembleFilm(
        buildTimeline(scenes, {
          effects: { transitionPaths: sounds, seed },
        }),
        output,
      );
      const plan = cutSoundPlan(3, 5, seed);
      expect(new Set(plan.slice(0, 3).map((cut) => cut.sound)).size).toBe(3);
      expect(plan.slice(3).map((cut) => cut.pitch)).toStrictEqual([-3, -3]);
      // Every sound as made and shifted: each cut's own is the loudest of them.
      const heard = tones.flatMap((hz) => [hz, hz * 2 ** (-3 / 12)]);
      for (const [cut, { sound, pitch }] of plan.entries()) {
        // The sound starts 0.4 s before its cut (1.5 s, 3 s, ...).
        const at = 1.5 * (cut + 1) - 0.3;
        const levels = heard.map((hz) => bandDb(output, at, 0.4, hz));
        const loudest = heard[levels.indexOf(Math.max(...levels))];
        expect(loudest).toBe(tones[sound] * 2 ** (pitch / 12));
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);

/**
 * A database for one render: two scenes with clips in the tenant's folder, and the film's
 * stored sound effects (`sounds`, marketing_assets rows).
 */
function renderDb(dir, payload, sounds = []) {
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
      if (
        table === "marketing_assets" &&
        query.includes("type=eq.sound_effect")
      )
        return sounds;
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
      // The production's own render (advance_video_production recorded its run id).
      const production = {
        status: "running",
        render_run_id: "run-1",
        estimate: { sound_effects: { usd: 0.09 } },
      };
      const db = renderDb(dir, { video: { sound_design: true, production } });
      const done = await renderFilm({
        db,
        run: run(),
        resolveElevenLabsKey: async () => "xi-key",
        makeEffects: (input) =>
          filmSoundEffects({ ...input, generate: async () => fx }),
        log: () => {},
      });
      expect(done.output.sound_effects_error).toBe(null);
      expect(Object.keys(done.output.sound_effects)).toStrictEqual(
        SOUND_EFFECT_NAMES,
      );
      expect(done.costUsd).toBe(soundEffectsCostUsd(SOUND_EFFECT_NAMES));
      const film = join(dir, "film.mp4");
      await writeFile(film, db.stored.get(done.output.path));
      expect(loudness(film, 1.65, 0.3)).toBeGreaterThan(-40);

      const keyless = renderDb(dir, {
        video: { sound_design: true, production },
      });
      const plain = await renderFilm({
        db: keyless,
        run: run(),
        log: () => {},
      });
      expect(plain.output.sound_effects_error).toMatch(/אין מפתח ElevenLabs/);
      expect(plain.costUsd).toBe(0);
      expect(keyless.stored.has(plain.output.path)).toBe(true);

      // A render outside the production (the studio button, video_director) stays free: with
      // no stored effects it renders without them and never calls ElevenLabs.
      let generated = 0;
      const free = await renderFilm({
        db: renderDb(dir, {
          video: {
            sound_design: true,
            production: { status: "done", render_run_id: "run-1" },
          },
        }),
        run: run(),
        resolveElevenLabsKey: async () => "xi-key",
        makeEffects: (input) =>
          filmSoundEffects({
            ...input,
            generate: async () => {
              generated += 1;
              return fx;
            },
          }),
        log: () => {},
      });
      expect(generated).toBe(0);
      expect(free.costUsd).toBe(0);
      expect(free.output.sound_effects_error).toMatch(/רק בהפקה/);
      const other = await renderFilm({
        db: renderDb(dir, {
          video: {
            sound_design: true,
            production: { ...production, render_run_id: "run-0" },
          },
        }),
        run: run(),
        resolveElevenLabsKey: async () => "xi-key",
        makeEffects: (input) =>
          filmSoundEffects({
            ...input,
            generate: async () => {
              generated += 1;
              return fx;
            },
          }),
        log: () => {},
      });
      expect(generated).toBe(0);
      expect(other.costUsd).toBe(0);
      // A production whose quote did not price the effects (the studio's plan) does not pay.
      const unquoted = await renderFilm({
        db: renderDb(dir, {
          video: {
            sound_design: true,
            production: { ...production, estimate: { clips: { usd: 1 } } },
          },
        }),
        run: run(),
        resolveElevenLabsKey: async () => "xi-key",
        makeEffects: (input) =>
          filmSoundEffects({
            ...input,
            generate: async () => {
              generated += 1;
              return fx;
            },
          }),
        log: () => {},
      });
      expect(generated).toBe(0);
      expect(unquoted.costUsd).toBe(0);

      // A production quoted before the set ($0.05) for a film with version 1's effects makes
      // only what the quote covers, and its report says the set is incomplete although the
      // old impact stands in.
      await writeFile(join(dir, "impact-v1.wav"), fx);
      const older = await renderFilm({
        db: renderDb(
          dir,
          {
            video: {
              sound_design: true,
              production: {
                ...production,
                estimate: { sound_effects: { usd: 0.05 } },
              },
            },
          },
          [
            {
              url: `${TENANT}/general/${ITEM}/sound-effects/impact-v1.wav`,
              meta: { effect: "impact", version: 1 },
            },
          ],
        ),
        run: run(),
        resolveElevenLabsKey: async () => "xi-key",
        makeEffects: (input) =>
          filmSoundEffects({
            ...input,
            generate: async () => {
              generated += 1;
              return fx;
            },
          }),
        log: () => {},
      });
      expect(generated).toBe(4);
      expect(older.costUsd).toBeLessThanOrEqual(0.05);
      expect(older.output.sound_effects.impact).toMatch(/impact-v1\.wav$/);
      expect(older.output.sound_effects_error).toBe(OVER_QUOTE);

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
