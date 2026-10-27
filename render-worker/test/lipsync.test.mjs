import { expect, test } from "vitest";
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
  expect(isTalkingScene(scene)).toBe(true);
  expect(talkingLine(scene)).toBe(LINE);
  expect(narrationLine(scene)).toBe("");
  expect(
    talkingLine({ voiceover_text: " רק קריינות\n", meta: { lipsync: true } }),
  ).toBe("רק קריינות");
  expect(talkingLine({ voiceover_text: "x", meta: {} })).toBe("");
  expect(narrationLine({ voiceover_text: " x ", meta: {} })).toBe("x");
});

test("ElevenLabs lip sync sends Creatify Aurora the still and the voice line inline", () => {
  const body = elevenLabsLipsyncBody({ imageBytes: PNG, audioBytes: MP3 });
  expect(body.model_id).toBe("creatify-aurora");
  expect(body.image.type).toBe("inline_base64");
  expect(body.image.mime_type).toBe("image/png");
  expect(body.audio.mime_type).toBe("audio/mpeg");
  expect(Buffer.from(body.audio.content_base64, "base64").length).toBe(
    MP3.length,
  );
  expect(body.resolution).toBe("720p");
  expect(audioMime(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe("audio/wav");
  expect(() => elevenLabsLipsyncBody({ imageBytes: PNG })).toThrow(
    /voice line/,
  );
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
    expect(provider.needs).toBe("video");
    const { jobId } = await provider.submit({
      videoUrl: "https://p.supabase.co/v.mp4",
      audioUrl: "https://p.supabase.co/a.mp3",
    });
    expect(jobId).toBe("k-1");
    expect(calls[0].url).toMatch(/\/v1\/videos\/lip-sync$/);
    expect(JSON.parse(calls[0].init.body)).toStrictEqual({
      input: {
        video_url: "https://p.supabase.co/v.mp4",
        mode: "audio2video",
        audio_type: "url",
        audio_url: "https://p.supabase.co/a.mp3",
      },
    });
    expect(calls[0].init.headers.Authorization).toMatch(/^Bearer /);
    expect(await provider.poll("k-1")).toStrictEqual({
      status: "succeeded",
      url: "https://cdn/x.mp4",
    });
    expect(calls[1].url).toMatch(/\/v1\/videos\/lip-sync\/k-1$/);
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
  expect(body.image_urls).toStrictEqual(["https://p.supabase.co/s.png"]);
  expect(body.audio_urls).toStrictEqual(["https://p.supabase.co/a.mp3"]);
  expect(body.duration).toBe(4);
  const talking = higgsfieldTalkingBody({
    prompt: "p",
    imageUrl: "https://p.supabase.co/s.png",
    durationS: 40,
  });
  expect(Object.keys(talking).sort()).toStrictEqual([
    "duration",
    "generate_audio",
    "image_url",
    "prompt",
    "resolution",
  ]);
  expect(talking.duration).toBe(30);
  expect(talking.generate_audio).toBe(true);
});

test("lip-sync providers follow the keys; a saved job only resumes its own provider", () => {
  expect(lipsyncCandidates({}, {})).toStrictEqual([]);
  expect(
    lipsyncCandidates(
      { elevenLabsKey: "xi", higgsfieldKeyId: "a", higgsfieldKeySecret: "b" },
      { KLING_ACCESS_KEY: "k", KLING_SECRET_KEY: "s" },
    ),
  ).toStrictEqual(["elevenlabs", "kling", "higgsfield"]);
  expect(
    lipsyncProviderNames(
      { input: {} },
      { higgsfieldKeySecret: "a:b" },
      { LIPSYNC_PROVIDER: "kling" },
    ),
  ).toStrictEqual(["kling", "higgsfield"]);
  expect(
    lipsyncProviderNames(
      { provider: "higgsfield", provider_job_id: "h-1" },
      { elevenLabsKey: "xi" },
      {},
    ),
  ).toStrictEqual(["higgsfield"]);
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
  expect(seen.submits.length).toBe(1);
  expect([...seen.submits[0].audioBytes]).toStrictEqual([...MP3]);
  expect([...seen.submits[0].imageBytes]).toStrictEqual([...PNG]);
  expect(order[0]).toBe("poll-after-save");
  expect(db.calls.updates[0].patch.provider_job_id).toStrictEqual("job-1");
  expect(db.calls.updates[0].patch.provider).toBe("elevenlabs");
  const attach = db.calls.rpcs.find(
    (call) => call.name === "attach_video_scene_asset",
  );
  expect(attach.args.p_kind).toBe("clip");
  expect(attach.args.p_url).toBe("t1/c1/i1/s1/lipsync-v1.mp4");
  expect(attach.args.p_meta.lipsync).toBe(true);
  expect(attach.args.p_meta.provider).toBe("elevenlabs");
  expect(attach.args.p_meta.dialogue).toBe(LINE);
  expect(attach.args.p_meta.voice_asset_id).toBe("voice-1");
  expect(db.calls.uploads.at(-1).path).toBe("t1/c1/i1/s1/lipsync-v1.mp4");
  expect(result.provider).toBe("elevenlabs");
  expect(result.output.lipsync).toBe(true);
});

test("the lip-sync submit and the save of its job id run inside the worker's submit guard", async () => {
  const db = fakeDb();
  const { provider } = fakeProvider();
  let inside = false;
  const seen = [];
  const update = db.update;
  db.update = async (table, query, patch) => {
    seen.push(["save", inside]);
    return update(table, query, patch);
  };
  await generateLipsync({
    db,
    run: RUN,
    keys: { elevenLabsKey: "xi" },
    providerFor: () => ({
      ...provider,
      submit: async (input) => {
        seen.push(["submit", inside]);
        return provider.submit(input);
      },
    }),
    env: {},
    log: () => {},
    submitting: async (submit) => {
      inside = true;
      try {
        return await submit();
      } finally {
        inside = false;
      }
    },
  });
  expect(seen).toStrictEqual([
    ["submit", true],
    ["save", true],
  ]);
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
  expect(seen.submits.length).toBe(0);
  expect(seen.polls).toBe(1);
  expect(db.calls.updates.length).toBe(0);
  const attach = db.calls.rpcs.find(
    (call) => call.name === "attach_video_scene_asset",
  );
  expect(attach.args.p_meta.provider_job_id).toBe("job-9");
  expect(attach.args.p_meta.source_kind).toBe("clip");
});

test("a voice path outside the run's tenant folder is refused before any provider call", async () => {
  const db = fakeDb({ voiceUrl: "t2/c1/i1/s1/voice.audio" });
  const { provider, seen } = fakeProvider();
  await expect(
    generateLipsync({
      db,
      run: RUN,
      keys: { elevenLabsKey: "xi" },
      providerFor: () => provider,
      env: {},
      log: () => {},
    }),
  ).rejects.toThrow(/outside the tenant folder/);
  expect(seen.submits.length).toBe(0);
});

test("a scene from another tenant is not found", async () => {
  const db = fakeDb();
  const { provider } = fakeProvider();
  await expect(
    generateLipsync({
      db,
      run: { ...RUN, tenant_id: "t2" },
      keys: { elevenLabsKey: "xi" },
      providerFor: () => provider,
      env: {},
      log: () => {},
    }),
  ).rejects.toThrow(/not in the run's tenant/);
});

test("without any lip-sync key the run fails with a clear, final message", async () => {
  const db = fakeDb();
  await expect(
    generateLipsync({ db, run: RUN, keys: {}, env: {}, log: () => {} }),
  ).rejects.toSatisfy(
    (error) => error.final === true && error.message === NO_LIPSYNC_PROVIDER,
  );
});

test("a voice of another line is not lip-synced", async () => {
  const db = fakeDb({ voiceText: "שורה אחרת" });
  const { provider, seen } = fakeProvider();
  await expect(
    generateLipsync({
      db,
      run: RUN,
      keys: { elevenLabsKey: "xi" },
      providerFor: () => provider,
      env: {},
      log: () => {},
    }),
  ).rejects.toThrow(/own voice line is missing/);
  expect(seen.submits.length).toBe(0);
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
  expect(submits[0].generateAudio).toBe(true);
  expect(submits[0].talking).toBe(true);
  expect(submits[0].prompt.includes(LINE)).toBeTruthy();
  expect(
    submits[0].prompt.startsWith("Camera holds Carmen looks at the camera"),
  ).toBeTruthy();
  expect(
    submits[0].prompt.endsWith("No text, no letters, no logos."),
  ).toBeTruthy();
  const attach = db.calls.rpcs.find(
    (call) => call.name === "attach_video_scene_asset",
  );
  expect(attach.args.p_meta.lipsync).toBe(true);
  expect(attach.args.p_meta.native_speech).toBe(true);
  expect(attach.args.p_meta.dialogue).toBe(LINE);
  expect(
    talkingPrompt("", { line: "x" }).startsWith("Subtle natural motion"),
  ).toBe(true);
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
  expect(submits[0].generateAudio).toBe(false);
  expect(!submits[0].prompt.includes(LINE)).toBeTruthy();
  const attach = db.calls.rpcs.find(
    (call) => call.name === "attach_video_scene_asset",
  );
  expect(attach.args.p_meta.lipsync).toBe(undefined);
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
  expect(sources.narrationPath).toBe(null);
  const [narrated, talking] = sources.scenes;
  expect(narrated.voicePath).toBe("t1/c1/i1/a/voice.audio");
  expect(narrated.lipsync).toBe(false);
  expect(talking.voicePath).toBe(null);
  expect(talking.lipsync).toBe(true);
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
  expect(manifest.scenes[0].voice).toBe("voice-0.mp3");
  expect(manifest.scenes[0].lipsync).toBe(false);
  expect(manifest.scenes[1].lipsync).toBe(true);
  expect(manifest.scenes[1].clipVolume).toBe(1);
  expect(manifest.scenes[1].move).toBe("static");
  expect(manifest.scenes[1].voice).toBe(null);
  // The talking scene stretches to its whole line.
  expect(manifest.scenes[1].frameCount >= Math.floor(5.5 * 30)).toBeTruthy();
  expect(files.some((file) => file.to === "voice-0.mp3")).toBeTruthy();
});

test("OpenRouter is the last lip-sync option and says the line itself with audio", async () => {
  const { lipsyncCandidates, openRouterLipsyncProvider } =
    await import("../src/providers/lipsync.mjs");
  expect(
    lipsyncCandidates({ elevenLabsKey: "e", openRouterKey: "o" }, {}).at(-1),
  ).toBe("openrouter");
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
  expect(jobId).toBe("job-1");
  expect(sent.generate_audio).toBe(true);
  expect(sent.model).toBe(provider.model);
  expect(sent.prompt).toMatch(/שלום/);
});

/** fakeDb whose scene clip is an older lip sync over the animated clip "motion-1". */
function relippedDb() {
  const db = fakeDb();
  const select = db.select;
  db.select = async (table, query) => {
    if (table === "marketing_assets" && query.includes("type=eq.video_clip")) {
      if (query.includes("id=eq.clip-1"))
        return [
          {
            id: "clip-1",
            url: "t1/c1/i1/s1/lipsync-v1.mp4",
            meta: {
              lipsync: true,
              dialogue: "שורה ישנה",
              source_kind: "still",
              motion_clip_asset_id: "motion-1",
            },
          },
        ];
      if (query.includes("id=eq.motion-1"))
        return [
          {
            id: "motion-1",
            url: "t1/c1/i1/s1/clip-v1.mp4",
            meta: { aspect: "9:16" },
          },
        ];
    }
    return select(table, query);
  };
  return db;
}

test("a lip sync of the still keeps the scene's animated clip for the film", async () => {
  const db = fakeDb();
  const { provider } = fakeProvider();
  await generateLipsync({
    db,
    run: RUN,
    keys: { elevenLabsKey: "xi" },
    providerFor: () => provider,
    env: {},
    log: () => {},
  });
  const attach = db.calls.rpcs.find(
    (call) => call.name === "attach_video_scene_asset",
  );
  expect(attach.args.p_meta.source_kind).toBe("still");
  // The silent clip with the skin's movement plays after the line (workshop-manifest.mjs).
  expect(attach.args.p_meta.motion_clip_asset_id).toBe("clip-1");
});

test("a new line keeps the movement: the earlier animated clip is reused, never the old lip sync", async () => {
  // Still-based (Aurora): the animated clip behind the old lip sync is carried over.
  const still = relippedDb();
  const aurora = fakeProvider();
  await generateLipsync({
    db: still,
    run: RUN,
    keys: { elevenLabsKey: "xi" },
    providerFor: () => aurora.provider,
    env: {},
    log: () => {},
  });
  const attached = still.calls.rpcs.find(
    (call) => call.name === "attach_video_scene_asset",
  );
  expect(attached.args.p_meta.motion_clip_asset_id).toBe("motion-1");
  // Clip-based (Kling): the mouth is re-timed on the animated clip, not on the old lip sync.
  const clip = relippedDb();
  const kling = fakeProvider("kling");
  const klingProvider = {
    ...kling.provider,
    needs: "video",
    needsPublicMedia: true,
  };
  await generateLipsync({
    db: clip,
    run: RUN,
    keys: {},
    providerFor: () => klingProvider,
    env: { LIPSYNC_PROVIDER: "kling" },
    log: () => {},
  });
  expect(kling.seen.submits[0].videoUrl).toBe(
    "https://p.supabase.co/sign/t1/c1/i1/s1/clip-v1.mp4",
  );
  const relipped = clip.calls.rpcs.find(
    (call) => call.name === "attach_video_scene_asset",
  );
  expect(relipped.args.p_meta.source_asset_id).toBe("motion-1");
  expect(relipped.args.p_meta.motion_clip_asset_id).toBeUndefined();
});

/** OpenRouter's video API: a POST starts job "hg-1", which is done and charged `cost`. */
function fakeOpenRouterFetch(cost, posted = []) {
  return async (url, init = {}) => {
    if (init.method === "POST") {
      posted.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ id: "hg-1" }) };
    }
    if (url.endsWith("/content?index=0"))
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([0, 0, 0, 1]).buffer,
      };
    return {
      ok: true,
      json: async () => ({ status: "completed", usage: { cost } }),
    };
  };
}

test("HeyGen Avatar IV on OpenRouter lip-syncs the portrait to the supplied voice line", async () => {
  const { heygenLipsyncBody, heygenLipsyncProvider } =
    await import("../src/providers/lipsync.mjs");
  const body = heygenLipsyncBody({
    imageUrl: "https://p.supabase.co/sign/still.png",
    audioUrl: "https://p.supabase.co/sign/voice.audio",
    prompt: 'Carmen speaks "שלום".',
    aspect: "9:16",
  });
  expect(body).toStrictEqual({
    model: "heygen/avatar-iv",
    prompt: 'Carmen speaks "שלום".',
    resolution: "1080p",
    aspect_ratio: "9:16",
    input_references: [
      {
        type: "image_url",
        image_url: { url: "https://p.supabase.co/sign/still.png" },
      },
      {
        type: "audio_url",
        audio_url: { url: "https://p.supabase.co/sign/voice.audio" },
      },
    ],
  });
  // Avatar IV renders 16:9, 9:16 and 1:1 only.
  expect(
    heygenLipsyncBody({ ...body, imageUrl: "a", audioUrl: "b", aspect: "4:5" })
      .aspect_ratio,
  ).toBe("9:16");
  expect(() => heygenLipsyncBody({ imageUrl: "a" })).toThrow(/voice line/);

  const posted = [];
  const provider = heygenLipsyncProvider({
    apiKey: "or-key",
    fetchImpl: fakeOpenRouterFetch(0.2, posted),
  });
  expect(provider.name).toBe("heygen");
  expect(provider.needs).toBe("image");
  expect(provider.needsPublicMedia).toBe(true);
  // $0.05 per second of the line.
  expect(provider.estimate({ durationS: 3.2 }).usd).toBe(0.2);
  const { jobId } = await provider.submit({
    imageUrl: "https://p.supabase.co/sign/still.png",
    audioUrl: "https://p.supabase.co/sign/voice.audio",
    prompt: "p",
    aspect: "9:16",
  });
  expect(jobId).toBe("hg-1");
  expect(posted[0].model).toBe("heygen/avatar-iv");
  const done = await provider.poll("hg-1");
  expect(done.status).toBe("succeeded");
  expect(done.costUsd).toBe(0.2);
});

test("HeyGen comes before the Veo fallback, and a refused plan moves the line on to it", async () => {
  const { elevenLabsLipsyncProvider, heygenLipsyncProvider } =
    await import("../src/providers/lipsync.mjs");
  expect(
    lipsyncCandidates({ elevenLabsKey: "e", openRouterKey: "o" }, {}),
  ).toStrictEqual(["elevenlabs", "heygen", "openrouter"]);
  // A line in the chosen voice (Yael): never Veo, which speaks in its own voice.
  const db = fakeDb({
    scene: { meta: { ...talkingMeta, chosen_voice: true } },
  });
  const sent = [];
  const result = await generateLipsync({
    db,
    run: RUN,
    keys: { elevenLabsKey: "xi", openRouterKey: "or" },
    providerFor: (name, keys) =>
      name === "elevenlabs"
        ? elevenLabsLipsyncProvider({
            apiKey: keys.elevenLabsKey,
            fetchImpl: async () => ({
              ok: false,
              status: 402,
              json: async () => ({
                detail: { code: "paid_plan_required" },
              }),
            }),
          })
        : heygenLipsyncProvider({
            apiKey: keys.openRouterKey,
            fetchImpl: fakeOpenRouterFetch(0.21, sent),
          }),
    env: {},
    log: () => {},
  });
  expect(result.provider).toBe("heygen");
  expect(sent.length).toBe(1);
  const [image, audio] = sent[0].input_references;
  expect(image.image_url.url).toMatch(
    /^https:\/\/p\.supabase\.co\/sign\/t1\/c1\/i1\/s1\/lipsync-still-r1\.png$/,
  );
  expect(audio.audio_url.url).toMatch(
    /^https:\/\/p\.supabase\.co\/sign\/t1\/c1\/i1\/s1\/lipsync-audio-r1\.audio$/,
  );
  // The run records what OpenRouter charged, not the estimate.
  expect(result.costUsd).toBe(0.21);
  const attach = db.calls.rpcs.find(
    (call) => call.name === "attach_video_scene_asset",
  );
  expect(attach.args.p_meta.provider).toBe("heygen");
  expect(attach.args.p_meta.generation_cost.usd).toBe(0.21);
});

test("a HeyGen lip sync keeps the voice line's word timings for the captions; a Veo clip does not", async () => {
  const alignment = { characters: ["ש"], character_start_times_seconds: [0] };
  const sourcesWith = async (provider) => {
    const scene = {
      id: "b",
      position: 1,
      overlay_text: "",
      voiceover_text: "",
      duration_s: 3,
      clip_asset_id: "cb",
      voice_asset_id: "vb",
      still_asset_id: null,
      meta: talkingMeta,
    };
    const assets = [
      {
        id: "cb",
        type: "video_clip",
        url: "t1/c1/i1/b/lipsync-v1.mp4",
        meta: {
          provider,
          lipsync: true,
          dialogue: LINE,
          source_kind: "still",
          voice_asset_id: "vb",
        },
      },
      {
        id: "vb",
        type: "voiceover",
        url: "t1/c1/i1/b/voice.audio",
        meta: { text: LINE, alignment },
      },
    ];
    const db = {
      select: async (table, query) =>
        table === "marketing_video_scenes"
          ? [scene]
          : table === "marketing_assets" && query.startsWith("id=in.")
            ? assets
            : [],
    };
    return (await loadFilmSources(db, { item_id: "i1", tenant_id: "t1" }))
      .scenes[0];
  };
  const heygen = await sourcesWith("heygen");
  const veo = await sourcesWith("openrouter");
  expect(heygen.spokenAlignment).toStrictEqual(alignment);
  expect(veo.spokenAlignment).toBe(null);
});
