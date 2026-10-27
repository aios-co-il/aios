import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { generateClip } from "../src/jobs/clip.mjs";
import { generateLipsync } from "../src/jobs/lipsync.mjs";
import { loadFilmSources } from "../src/jobs/render.mjs";
import { speaksInChosenVoice } from "../src/narration.mjs";
import { kenBurnsClip } from "../src/providers/mock.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

const LINE = "אני כרמן, הקמפיינרית שלך";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 5, 6]);
const ownPicture = {
  lipsync: true,
  chosen_voice: true,
  speaker: "Carmen, a 3D animated woman with long curly brown hair",
  dialogue: LINE,
};

/** The run's item, a talking scene of the user's own picture and its assets, for tenant t1. */
function fakeDb(meta = ownPicture) {
  const calls = { uploads: [], rpcs: [], updates: [] };
  return {
    calls,
    download: async (_bucket, path) => (path.includes("voice") ? MP3 : PNG),
    select: async (table, query) => {
      if (!query.includes("tenant_id=eq.t1")) return [];
      if (table === "marketing_work_items")
        return [{ id: "i1", tenant_id: "t1", client_id: "c1" }];
      if (table === "marketing_video_scenes")
        return [
          {
            id: "s1",
            still_asset_id: "still-1",
            clip_asset_id: "clip-1",
            voice_asset_id: "voice-1",
            voiceover_text: "",
            duration_s: 5,
            meta,
          },
        ];
      if (table === "marketing_assets") {
        if (query.includes("id=eq.voice-1"))
          return [
            {
              id: "voice-1",
              url: "t1/c1/i1/s1/voice-r0.audio",
              meta: { text: LINE },
            },
          ];
        if (query.includes("id=eq.still-1"))
          return [{ id: "still-1", url: "t1/c1/i1/s1/still.png", meta: {} }];
        if (query.includes("id=eq.clip-1"))
          return [{ id: "clip-1", url: "t1/c1/i1/s1/clip-v1.mp4", meta: {} }];
      }
      return [];
    },
    upload: async (bucket, path, bytes, contentType) =>
      calls.uploads.push({ bucket, path, size: bytes.length, contentType }),
    sign: async (_bucket, path) => `https://p.supabase.co/sign/${path}`,
    rpc: async (name, args) => calls.rpcs.push({ name, args }),
    update: async (table, query, patch) =>
      calls.updates.push({ table, query, patch }),
  };
}

const RUN = {
  id: "run-1",
  tenant_id: "t1",
  item_id: "i1",
  scene_id: "s1",
  kind: "lipsync",
  input: { aspect: "9:16" },
};

test("only a talking scene marked for the chosen voice speaks in it", () => {
  expect(speaksInChosenVoice({ meta: ownPicture })).toBe(true);
  expect(
    speaksInChosenVoice({ meta: { ...ownPicture, chosen_voice: false } }),
  ).toBe(false);
  expect(
    speaksInChosenVoice({ meta: { chosen_voice: true, lipsync: false } }),
  ).toBe(false);
});

test("an engine that speaks leaves a chosen-voice scene silent for the lip-sync pass", async () => {
  const db = fakeDb();
  const submits = [];
  await generateClip({
    db,
    run: {
      ...RUN,
      kind: "clip",
      input: { motion_prompt: "She turns to the camera", duration_s: 5 },
    },
    provider: {
      name: "openrouter",
      model: "kling-v3",
      talkingModel: "veo-3.1",
      nativeSpeech: true,
      estimate: () => ({ usd: 0.42, credits: 0 }),
      submit: async (input) => {
        submits.push(input);
        return { jobId: "o-1" };
      },
      poll: async () => ({ status: "succeeded", bytes: new Uint8Array([1]) }),
    },
    log: () => {},
  });
  expect(submits[0].talking).toBe(false);
  expect(submits[0].generateAudio).toBe(false);
  expect(submits[0].prompt.includes(LINE)).toBe(false);
  expect(submits[0].prompt.startsWith("She turns to the camera")).toBe(true);
  const attach = db.calls.rpcs.find(
    (call) => call.name === "attach_video_scene_asset",
  );
  // Not marked as speaking: advance_video_production queues the voice line and its lip sync.
  expect(attach.args.p_meta.lipsync).toBeUndefined();
  expect(attach.args.p_meta.model).toBe("kling-v3");
});

test("the lip sync of a chosen-voice scene animates the user's picture with that voice's line", async () => {
  const db = fakeDb();
  const sent = [];
  const result = await generateLipsync({
    db,
    run: RUN,
    keys: { elevenLabsKey: "xi" },
    providerFor: (name) => ({
      name,
      model: "creatify-aurora",
      needs: "image",
      estimate: ({ durationS }) => ({ usd: durationS * 0.1, credits: 0 }),
      submit: async (input) => {
        sent.push({ name, input });
        return { jobId: "e-1" };
      },
      poll: async () => ({ status: "succeeded", bytes: new Uint8Array([1]) }),
    }),
    env: {},
    log: () => {},
  });
  // ElevenLabs first: the still (the uploaded portrait) and the chosen voice's recording.
  expect(sent.map((entry) => entry.name)).toStrictEqual(["elevenlabs"]);
  expect(sent[0].input.imageBytes).toStrictEqual(PNG);
  expect(sent[0].input.audioBytes).toStrictEqual(MP3);
  expect(sent[0].input.aspect).toBe("9:16");
  expect(result.output.lipsync).toBe(true);
  const attach = db.calls.rpcs.find(
    (call) => call.name === "attach_video_scene_asset",
  );
  expect(attach.args.p_meta.source_kind).toBe("still");
  expect(attach.args.p_meta.source_asset_id).toBe("still-1");
  expect(attach.args.p_meta.voice_asset_id).toBe("voice-1");
  expect(attach.args.p_meta.dialogue).toBe(LINE);
});

test("a chosen-voice line never goes to OpenRouter Veo, which speaks in its own voice", async () => {
  const tried = [];
  const providerFor = (name) => {
    tried.push(name);
    return { name, needs: "image" };
  };
  await expect(
    generateLipsync({
      db: fakeDb(),
      run: RUN,
      keys: { openRouterKey: "or" },
      providerFor,
      env: {},
      log: () => {},
    }),
  ).rejects.toThrow(/no lip-sync provider/);
  expect(tried).toStrictEqual([]);
});

/** Five 80 px stripes side by side (red, green, blue, yellow, white): a 400x300 landscape still. */
function stripedStill() {
  const colors = ["red", "lime", "blue", "yellow", "white"];
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      ...colors.flatMap((color) => [
        "-f",
        "lavfi",
        "-i",
        `color=c=${color}:s=80x300`,
      ]),
      "-filter_complex",
      `${colors.map((_, index) => `[${index}:v]`).join("")}hstack=inputs=${colors.length}`,
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-c:v",
      "png",
      "-",
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  return new Uint8Array(result.stdout);
}

/** The RGB of one pixel of a clip's first frame. */
function pixel(file, width, x, y) {
  const frame = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      file,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 20 * 1024 * 1024 },
  ).stdout;
  const at = (y * width + x) * 3;
  return [frame[at], frame[at + 1], frame[at + 2]];
}

test.skipIf(!hasFfmpeg)(
  "a landscape picture in a Reels film is cropped to fill 9:16, never stretched",
  async () => {
    const bytes = await kenBurnsClip(stripedStill(), {
      durationS: 1,
      aspect: "9:16",
      fps: 10,
    });
    const dir = await mkdtemp(join(tmpdir(), "cover-"));
    try {
      const file = join(dir, "clip.mp4");
      await writeFile(file, bytes);
      const size = spawnSync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0",
        file,
      ]).stdout.toString();
      expect(size.trim()).toBe("720,1280");
      // Cover keeps the middle of the picture: the frame's edges fall in the green and yellow
      // stripes. A stretched picture would show red and white at its edges.
      const [lr, lg, lb] = pixel(file, 720, 8, 640);
      const [rr, rg, rb] = pixel(file, 720, 711, 640);
      expect(lg > 150 && lr < 100 && lb < 100).toBe(true);
      expect(rr > 150 && rg > 150 && rb < 100).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test("the film plays the skin's move after her lip-synced line, captioned on the voice's timings", async () => {
  const words = { words: [{ text: "אני", start: 0, end: 0.3 }] };
  const assets = [
    {
      id: "lipsync-1",
      type: "video_clip",
      url: "t1/c1/i1/s1/lipsync-v1.mp4",
      meta: {
        lipsync: true,
        dialogue: LINE,
        provider: "elevenlabs",
        source_kind: "still",
        voice_asset_id: "voice-1",
        motion_clip_asset_id: "clip-1",
      },
    },
    {
      id: "still-1",
      type: "video_still",
      url: "t1/c1/i1/s1/still.png",
      meta: {},
    },
    {
      id: "voice-1",
      type: "voiceover",
      url: "t1/c1/i1/s1/voice-r0.audio",
      meta: { text: LINE, alignment: words },
    },
    {
      id: "clip-1",
      type: "video_clip",
      url: "t1/c1/i1/s1/clip-v1.mp4",
      meta: {},
    },
  ];
  const scene = {
    id: "s1",
    position: 1,
    overlay_text: "",
    voiceover_text: "",
    duration_s: 5,
    clip_asset_id: "lipsync-1",
    voice_asset_id: "voice-1",
    still_asset_id: "still-1",
    meta: ownPicture,
  };
  const db = {
    select: async (table, query) => {
      if (!query.includes("tenant_id=eq.t1")) return [];
      if (table === "marketing_video_scenes") return [scene];
      if (table === "marketing_assets") {
        const ids = /id=in\.\(([^)]*)\)/.exec(query)?.[1] ?? "";
        return assets.filter((asset) => ids.includes(asset.id));
      }
      return [];
    },
  };
  const { scenes } = await loadFilmSources(db, {
    id: "r1",
    tenant_id: "t1",
    item_id: "i1",
  });
  expect(scenes[0].clipPath).toBe("t1/c1/i1/s1/lipsync-v1.mp4");
  expect(scenes[0].lipsync).toBe(true);
  expect(scenes[0].voicePath).toBe(null);
  expect(scenes[0].moveClipPath).toBe("t1/c1/i1/s1/clip-v1.mp4");
  expect(scenes[0].spokenAlignment).toStrictEqual(words);
  // A clip that speaks in its engine's own voice has no voice file behind its lips.
  assets[0].meta = { lipsync: true, dialogue: LINE, provider: "openrouter" };
  const own = await loadFilmSources(db, {
    id: "r1",
    tenant_id: "t1",
    item_id: "i1",
  });
  expect(own.scenes[0].spokenAlignment).toBe(null);
  expect(own.scenes[0].moveClipPath).toBe(null);
});
