import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";
import { generateClip } from "../src/jobs/clip.mjs";
import { generateLipsync, NO_LIPSYNC_PROVIDER } from "../src/jobs/lipsync.mjs";
import { loadFilmSources } from "../src/jobs/render.mjs";
import {
  isTalkingScene,
  narrationLine,
  talkingLine,
} from "../src/narration.mjs";
import {
  lipsyncProviderNames,
  talkingPrompt,
} from "../src/providers/index.mjs";
import { higgsfieldTalkingBody } from "../src/providers/higgsfield.mjs";
import {
  audioMime,
  elevenLabsLipsyncBody,
  higgsfieldLipsyncBody,
  klingLipsyncProvider,
  lipsyncCandidates,
} from "../src/providers/lipsync.mjs";

const LINE = "שלום, אני כרמן";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 5, 6]);
const talkingMeta = { lipsync: true, speaker: "Carmen", dialogue: LINE };

test("a talking scene speaks its dialogue, else its voiceover, and is left out of the narration", () => {
  const scene = { voiceover_text: " קריינות ", meta: talkingMeta };
  assert.equal(isTalkingScene(scene), true);
  assert.equal(talkingLine(scene), LINE);
  assert.equal(narrationLine(scene), "");
  assert.equal(
    talkingLine({ voiceover_text: " רק קריינות\n", meta: { lipsync: true } }),
    "רק קריינות",
  );
  assert.equal(talkingLine({ voiceover_text: "x", meta: {} }), "");
  assert.equal(narrationLine({ voiceover_text: " x ", meta: {} }), "x");
});

test("ElevenLabs lip sync sends Creatify Aurora the still and the voice line inline", () => {
  const body = elevenLabsLipsyncBody({ imageBytes: PNG, audioBytes: MP3 });
  assert.equal(body.model_id, "creatify-aurora");
  assert.equal(body.image.type, "inline_base64");
  assert.equal(body.image.mime_type, "image/png");
  assert.equal(body.audio.mime_type, "audio/mpeg");
  assert.equal(
    Buffer.from(body.audio.content_base64, "base64").length,
    MP3.length,
  );
  assert.equal(body.resolution, "720p");
  assert.equal(
    audioMime(new Uint8Array([0x52, 0x49, 0x46, 0x46])),
    "audio/wav",
  );
  assert.throws(() => elevenLabsLipsyncBody({ imageBytes: PNG }), /voice line/);
});

test("Kling lip sync posts audio2video with the clip and audio urls, and reads the task back", async () => {
  process.env.KLING_ACCESS_KEY = "ak";
  process.env.KLING_SECRET_KEY = "sk";
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const body =
      init.method === "POST"
        ? { code: 0, data: { task_id: "k-1" } }
        : {
            code: 0,
            data: {
              task_status: "succeed",
              task_result: { videos: [{ url: "https://cdn/x.mp4" }] },
            },
          };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    const provider = klingLipsyncProvider({ fetchImpl });
    assert.equal(provider.needs, "video");
    const { jobId } = await provider.submit({
      videoUrl: "https://p.supabase.co/v.mp4",
      audioUrl: "https://p.supabase.co/a.mp3",
    });
    assert.equal(jobId, "k-1");
    assert.match(calls[0].url, /\/v1\/videos\/lip-sync$/);
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      input: {
        video_url: "https://p.supabase.co/v.mp4",
        mode: "audio2video",
        audio_type: "url",
        audio_url: "https://p.supabase.co/a.mp3",
      },
    });
    assert.match(calls[0].init.headers.Authorization, /^Bearer /);
    assert.deepEqual(await provider.poll("k-1"), {
      status: "succeeded",
      url: "https://cdn/x.mp4",
    });
    assert.match(calls[1].url, /\/v1\/videos\/lip-sync\/k-1$/);
  } finally {
    delete process.env.KLING_ACCESS_KEY;
    delete process.env.KLING_SECRET_KEY;
  }
});

test("Higgsfield lip sync and talking clips use the documented Seedance 2.5 fields", () => {
  const body = higgsfieldLipsyncBody({
    imageUrl: "https://p.supabase.co/s.png",
    audioUrl: "https://p.supabase.co/a.mp3",
    prompt: "p",
    durationS: 2,
    aspect: "9:16",
  });
  assert.deepEqual(body.image_urls, ["https://p.supabase.co/s.png"]);
  assert.deepEqual(body.audio_urls, ["https://p.supabase.co/a.mp3"]);
  assert.equal(body.duration, 4);
  const talking = higgsfieldTalkingBody({
    prompt: "p",
    imageUrl: "https://p.supabase.co/s.png",
    durationS: 40,
  });
  assert.deepEqual(Object.keys(talking).sort(), [
    "duration",
    "generate_audio",
    "image_url",
    "prompt",
    "resolution",
  ]);
  assert.equal(talking.duration, 30);
  assert.equal(talking.generate_audio, true);
});

test("lip-sync providers follow the keys; a saved job only resumes its own provider", () => {
  assert.deepEqual(lipsyncCandidates({}, {}), []);
  assert.deepEqual(
    lipsyncCandidates(
      { elevenLabsKey: "xi", higgsfieldKeyId: "a", higgsfieldKeySecret: "b" },
      { KLING_ACCESS_KEY: "k", KLING_SECRET_KEY: "s" },
    ),
    ["elevenlabs", "kling", "higgsfield"],
  );
  assert.deepEqual(
    lipsyncProviderNames(
      { input: {} },
      { higgsfieldKeySecret: "a:b" },
      { LIPSYNC_PROVIDER: "kling" },
    ),
    ["kling", "higgsfield"],
  );
  assert.deepEqual(
    lipsyncProviderNames(
      { provider: "higgsfield", provider_job_id: "h-1" },
      { elevenLabsKey: "xi" },
      {},
    ),
    ["higgsfield"],
  );
});

/** The run's item, talking scene and its assets, as the guard reads them for the run's tenant. */
function fakeDb({
  voiceUrl = "t1/c1/i1/s1/voice-r0.audio",
  voiceText = LINE,
  scene = {},
} = {}) {
  const calls = { uploads: [], rpcs: [], updates: [], order: [] };
  return {
    calls,
    download: async (bucket, path) => {
      calls.order.push(`download:${path}`);
      return path.includes("voice") ? MP3 : PNG;
    },
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
            duration_s: 4,
            meta: talkingMeta,
            ...scene,
          },
        ];
      if (table === "marketing_assets") {
        if (
          query.includes("id=eq.voice-1") &&
          query.includes("type=eq.voiceover")
        )
          return [{ id: "voice-1", url: voiceUrl, meta: { text: voiceText } }];
        // The clip job reads the still by id alone; the lip-sync job also checks its type.
        if (
          query.includes("id=eq.still-1") &&
          !/type=eq\.(?!video_still)/.test(query)
        )
          return [{ id: "still-1", url: "t1/c1/i1/s1/still-v1.png", meta: {} }];
        if (
          query.includes("id=eq.clip-1") &&
          query.includes("type=eq.video_clip")
        )
          return [
            {
              id: "clip-1",
              url: "t1/c1/i1/s1/clip-v1.mp4",
              meta: { aspect: "9:16" },
            },
          ];
        return [];
      }
      return [];
    },
    upload: async (bucket, path, bytes) =>
      calls.uploads.push({ bucket, path, size: bytes.length }),
    sign: async (bucket, path) => `https://p.supabase.co/sign/${path}`,
    rpc: async (name, args) => calls.rpcs.push({ name, args }),
    update: async (table, query, patch) => {
      calls.order.push("update");
      calls.updates.push({ table, query, patch });
    },
  };
}

function fakeProvider(name = "elevenlabs") {
  const seen = { submits: [], polls: 0 };
  return {
    seen,
    provider: {
      name,
      model: "creatify-aurora",
      needs: "image",
      estimate: ({ durationS }) => ({ credits: 0, usd: durationS * 0.1 }),
      submit: async (input) => {
        seen.submits.push(input);
        return { jobId: "job-1" };
      },
      poll: async () => {
        seen.polls += 1;
        return { status: "succeeded", bytes: new Uint8Array([0, 0, 0, 1]) };
      },
    },
  };
}

const RUN = {
  id: "r1",
  tenant_id: "t1",
  item_id: "i1",
  scene_id: "s1",
  kind: "lipsync",
  input: {},
};

test("a lip-sync run stores the provider job before polling and attaches a talking clip", async () => {
  const db = fakeDb();
  const { provider, seen } = fakeProvider();
  const order = [];
  const wrapped = {
    ...provider,
    poll: async (id) => {
      order.push(
        db.calls.updates.length ? "poll-after-save" : "poll-before-save",
      );
      return provider.poll(id);
    },
  };
  const result = await generateLipsync({
    db,
    run: RUN,
    keys: { elevenLabsKey: "xi" },
    providerFor: () => wrapped,
    env: {},
    log: () => {},
  });
  assert.equal(seen.submits.length, 1);
  assert.deepEqual([...seen.submits[0].audioBytes], [...MP3]);
  assert.deepEqual([...seen.submits[0].imageBytes], [...PNG]);
  assert.equal(order[0], "poll-after-save");
  assert.deepEqual(db.calls.updates[0].patch.provider_job_id, "job-1");
  assert.equal(db.calls.updates[0].patch.provider, "elevenlabs");
  const attach = db.calls.rpcs.find(
    (call) => call.name === "attach_video_scene_asset",
  );
  assert.equal(attach.args.p_kind, "clip");
  assert.equal(attach.args.p_url, "t1/c1/i1/s1/lipsync-v1.mp4");
  assert.equal(attach.args.p_meta.lipsync, true);
  assert.equal(attach.args.p_meta.provider, "elevenlabs");
  assert.equal(attach.args.p_meta.dialogue, LINE);
  assert.equal(attach.args.p_meta.voice_asset_id, "voice-1");
  assert.equal(db.calls.uploads.at(-1).path, "t1/c1/i1/s1/lipsync-v1.mp4");
  assert.equal(result.provider, "elevenlabs");
  assert.equal(result.output.lipsync, true);
});

test("a retried lip-sync run with a provider job resumes it and does not pay again", async () => {
  const db = fakeDb();
  const { provider, seen } = fakeProvider("kling");
  await generateLipsync({
    db,
    run: {
      ...RUN,
      provider: "kling",
      provider_job_id: "job-9",
      output: { lipsync_source: { kind: "clip", asset_id: "clip-1" } },
    },
    keys: { elevenLabsKey: "xi" },
    providerFor: () => provider,
    env: {},
    log: () => {},
  });
  assert.equal(seen.submits.length, 0);
  assert.equal(seen.polls, 1);
  assert.equal(db.calls.updates.length, 0);
  const attach = db.calls.rpcs.find(
    (call) => call.name === "attach_video_scene_asset",
  );
  assert.equal(attach.args.p_meta.provider_job_id, "job-9");
  assert.equal(attach.args.p_meta.source_kind, "clip");
});

test("a voice path outside the run's tenant folder is refused before any provider call", async () => {
  const db = fakeDb({ voiceUrl: "t2/c1/i1/s1/voice.audio" });
  const { provider, seen } = fakeProvider();
  await assert.rejects(
    generateLipsync({
      db,
      run: RUN,
      keys: { elevenLabsKey: "xi" },
      providerFor: () => provider,
      env: {},
      log: () => {},
    }),
    /outside the tenant folder/,
  );
  assert.equal(seen.submits.length, 0);
});

test("a scene from another tenant is not found", async () => {
  const db = fakeDb();
  const { provider } = fakeProvider();
  await assert.rejects(
    generateLipsync({
      db,
      run: { ...RUN, tenant_id: "t2" },
      keys: { elevenLabsKey: "xi" },
      providerFor: () => provider,
      env: {},
      log: () => {},
    }),
    /not in the run's tenant/,
  );
});

test("without any lip-sync key the run fails with a clear, final message", async () => {
  const db = fakeDb();
  await assert.rejects(
    generateLipsync({ db, run: RUN, keys: {}, env: {}, log: () => {} }),
    (error) => error.final === true && error.message === NO_LIPSYNC_PROVIDER,
  );
});

test("a voice of another line is not lip-synced", async () => {
  const db = fakeDb({ voiceText: "שורה אחרת" });
  const { provider, seen } = fakeProvider();
  await assert.rejects(
    generateLipsync({
      db,
      run: RUN,
      keys: { elevenLabsKey: "xi" },
      providerFor: () => provider,
      env: {},
      log: () => {},
    }),
    /own voice line is missing/,
  );
  assert.equal(seen.submits.length, 0);
});

test("on an engine that speaks, a talking scene is one clip with the line in the prompt", async () => {
  const db = fakeDb();
  const submits = [];
  const provider = {
    name: "elevenlabs",
    model: "veo-3.1-fast-generate-001",
    nativeSpeech: true,
    estimate: () => ({ usd: 0.6, credits: 0 }),
    submit: async (input) => {
      submits.push(input);
      return { jobId: "v-1" };
    },
    poll: async () => ({ status: "succeeded", bytes: new Uint8Array([1]) }),
  };
  await generateClip({
    db,
    run: {
      ...RUN,
      kind: "clip",
      input: { motion_prompt: "Camera holds", duration_s: 4 },
    },
    provider,
    log: () => {},
  });
  assert.equal(submits[0].generateAudio, true);
  assert.equal(submits[0].talking, true);
  assert.ok(submits[0].prompt.includes(LINE));
  assert.ok(
    submits[0].prompt.startsWith("Camera holds Carmen looks at the camera"),
  );
  assert.ok(submits[0].prompt.endsWith("No text, no letters, no logos."));
  const attach = db.calls.rpcs.find(
    (call) => call.name === "attach_video_scene_asset",
  );
  assert.equal(attach.args.p_meta.lipsync, true);
  assert.equal(attach.args.p_meta.native_speech, true);
  assert.equal(attach.args.p_meta.dialogue, LINE);
  assert.equal(
    talkingPrompt("", { line: "x" }).startsWith("Subtle natural motion"),
    true,
  );
});

test("a silent engine leaves the clip silent for the lip-sync pass", async () => {
  const db = fakeDb();
  const submits = [];
  const provider = {
    name: "kling",
    model: "kling-v3",
    estimate: () => ({ usd: 0.85, credits: 5100 }),
    submit: async (input) => {
      submits.push(input);
      return { jobId: "k-1" };
    },
    poll: async () => ({ status: "succeeded", bytes: new Uint8Array([1]) }),
  };
  await generateClip({
    db,
    run: { ...RUN, kind: "clip", input: {} },
    provider,
    log: () => {},
  });
  assert.equal(submits[0].generateAudio, false);
  assert.ok(!submits[0].prompt.includes(LINE));
  const attach = db.calls.rpcs.find(
    (call) => call.name === "attach_video_scene_asset",
  );
  assert.equal(attach.args.p_meta.lipsync, undefined);
});

test("a film with a talking scene plays its clip audio and narrates the other scenes one by one", async () => {
  const scenes = [
    {
      id: "a",
      position: 1,
      overlay_text: "",
      voiceover_text: "קריינות",
      duration_s: 3,
      clip_asset_id: "ca",
      voice_asset_id: "va",
      still_asset_id: null,
      meta: {},
    },
    {
      id: "b",
      position: 2,
      overlay_text: "",
      voiceover_text: "",
      duration_s: 3,
      clip_asset_id: "cb",
      voice_asset_id: "vb",
      still_asset_id: null,
      meta: talkingMeta,
    },
  ];
  const assets = [
    {
      id: "ca",
      type: "video_clip",
      url: "t1/c1/i1/a/clip-v1.mp4",
      meta: { provider: "kling" },
    },
    {
      id: "va",
      type: "voiceover",
      url: "t1/c1/i1/a/voice.audio",
      meta: { text: "קריינות" },
    },
    {
      id: "cb",
      type: "video_clip",
      url: "t1/c1/i1/b/lipsync-v1.mp4",
      meta: {
        provider: "elevenlabs",
        lipsync: true,
        dialogue: LINE,
        duration_s: 5.5,
      },
    },
    {
      id: "vb",
      type: "voiceover",
      url: "t1/c1/i1/b/voice.audio",
      meta: { text: LINE },
    },
  ];
  const db = {
    select: async (table, query) => {
      if (table === "marketing_video_scenes") return scenes;
      if (table === "marketing_assets" && query.startsWith("id=in."))
        return assets;
      if (query.includes("type=eq.narration"))
        return [{ url: "t1/c1/i1/narration.audio", meta: { text: "קריינות" } }];
      return [];
    },
  };
  const sources = await loadFilmSources(db, { item_id: "i1", tenant_id: "t1" });
  assert.equal(sources.narrationPath, null);
  const [narrated, talking] = sources.scenes;
  assert.equal(narrated.voicePath, "t1/c1/i1/a/voice.audio");
  assert.equal(narrated.lipsync, false);
  assert.equal(talking.voicePath, null);
  assert.equal(talking.lipsync, true);
  const { manifest, files } = buildWorkshopManifest({
    aspect: "9:16",
    scenes: sources.scenes.map((scene) => ({
      ...scene,
      clipPath: `/tmp/${scene.id}.mp4`,
      voicePath: scene.voicePath && `/tmp/${scene.id}.mp3`,
      // remotion.mjs probes the files; the talking clip runs 5.5 s.
      clipDurationS: scene.id === "b" ? 5.5 : 3,
      clipHasAudio: true,
    })),
  });
  assert.equal(manifest.scenes[0].voice, "voice-0.mp3");
  assert.equal(manifest.scenes[0].lipsync, false);
  assert.equal(manifest.scenes[1].lipsync, true);
  assert.equal(manifest.scenes[1].clipVolume, 1);
  assert.equal(manifest.scenes[1].move, "static");
  assert.equal(manifest.scenes[1].voice, null);
  // The talking scene stretches to its whole line.
  assert.ok(manifest.scenes[1].frameCount >= Math.floor(5.5 * 30));
  assert.ok(files.some((file) => file.to === "voice-0.mp3"));
});

test("OpenRouter is the last lip-sync option and says the line itself with audio", async () => {
  const { lipsyncCandidates, openRouterLipsyncProvider } =
    await import("../src/providers/lipsync.mjs");
  assert.deepEqual(
    lipsyncCandidates({ elevenLabsKey: "e", openRouterKey: "o" }, {}),
    ["elevenlabs", "openrouter"],
  );
  let sent = null;
  const provider = openRouterLipsyncProvider({
    apiKey: "or-key",
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ id: "job-1" }) };
    },
  });
  const { jobId } = await provider.submit({
    imageUrl: "https://x.supabase.co/s.png",
    prompt: 'She says "שלום".',
    durationS: 5,
    aspect: "9:16",
  });
  assert.equal(jobId, "job-1");
  assert.equal(sent.generate_audio, true);
  assert.equal(sent.model, provider.model);
  assert.match(sent.prompt, /שלום/);
});
