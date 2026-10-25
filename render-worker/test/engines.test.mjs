import assert from "node:assert/strict";
import { test } from "node:test";
import {
  elevenLabsAspect,
  elevenLabsClipSeconds,
  elevenLabsProvider,
  elevenLabsVideoBody,
} from "../src/providers/elevenlabs.mjs";
import {
  higgsfieldClipBody,
  higgsfieldClipSeconds,
  higgsfieldProvider,
} from "../src/providers/higgsfield.mjs";
import { musicBody, speechBody } from "../src/providers/elevenlabsSound.mjs";
import { getVideoProvider } from "../src/providers/index.mjs";

test("ElevenLabs snaps Veo durations and only uses the two aspects Veo accepts", () => {
  assert.equal(elevenLabsClipSeconds(3), 4);
  assert.equal(elevenLabsClipSeconds(6), 6);
  assert.equal(elevenLabsClipSeconds(9), 8);
  assert.equal(elevenLabsAspect("16:9"), "16:9");
  assert.equal(elevenLabsAspect("4:5"), "9:16");
  const body = elevenLabsVideoBody({
    prompt: "Camera pushes in",
    imageBytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
    durationS: 3,
    aspect: "9:16",
    generateAudio: false,
    model: "veo-3.1-fast-generate-001",
  });
  assert.equal(body.model_id, "veo-3.1-fast-generate-001");
  assert.equal(body.duration_secs, 4);
  assert.equal(body.generate_audio, false);
  assert.equal(body.start_frame.mime_type, "image/png");
  assert.equal(body.start_frame.type, "inline_base64");
});

test("Higgsfield sends the signed still and keeps the scene length", () => {
  assert.equal(higgsfieldClipSeconds(3.2), 4);
  assert.equal(higgsfieldClipSeconds(30), 15);
  assert.throws(() => higgsfieldClipBody({ prompt: "move", durationS: 5 }));
  assert.deepEqual(
    higgsfieldClipBody({
      prompt: "move",
      imageUrl: "https://files.example/still.png",
      durationS: 5,
      generateAudio: true,
    }),
    {
      prompt: "move",
      image_url: "https://files.example/still.png",
      duration: 5,
      resolution: "720p",
      generate_audio: true,
      negative_prompt: "text, letters, captions, logo, watermark",
    },
  );
});

test("the worker can build every scene engine and sound request", () => {
  assert.equal(getVideoProvider("mock").name, "mock");
  assert.equal(
    getVideoProvider("elevenlabs", { elevenLabsKey: "xi" }).name,
    "elevenlabs",
  );
  assert.equal(
    getVideoProvider("higgsfield", {
      higgsfieldKeyId: "id",
      higgsfieldKeySecret: "secret",
    }).name,
    "higgsfield",
  );
  assert.equal(speechBody("שלום", "eleven_v4").model_id, "eleven_v4");
  assert.equal(
    musicBody({ prompt: "bed", musicLengthMs: 8000 }).model_id,
    "music_v2_5",
  );
});

test("ElevenLabs and Higgsfield poll until the provider finishes", async () => {
  const elevenCalls = [];
  const eleven = elevenLabsProvider({
    apiKey: "xi",
    fetchImpl: async (url, init) => {
      elevenCalls.push({ url, body: init.body ? JSON.parse(init.body) : null });
      if (init.method === "POST")
        return {
          ok: true,
          json: async () => ({ id: "gen-1", status: "pending" }),
        };
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          content_url: "https://files.example/clip.mp4",
        }),
      };
    },
  });
  assert.equal(
    (await eleven.submit({ prompt: "go", durationS: 5, aspect: "16:9" })).jobId,
    "gen-1",
  );
  assert.equal((await eleven.poll("gen-1")).status, "succeeded");
  assert.equal(elevenCalls[0].body.model_id, "veo-3.1-fast-generate-001");

  const higgs = higgsfieldProvider({
    keyId: "id",
    keySecret: "secret",
    fetchImpl: async (url, init) => {
      if (init.method === "POST")
        return {
          ok: true,
          json: async () => ({ request_id: "req-1", status: "queued" }),
        };
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          video: { url: "https://files.example/hf.mp4" },
        }),
      };
    },
  });
  assert.equal(
    (
      await higgs.submit({
        prompt: "go",
        imageUrl: "https://files.example/still.png",
        durationS: 5,
      })
    ).jobId,
    "req-1",
  );
  assert.equal((await higgs.poll("req-1")).url, "https://files.example/hf.mp4");
});

test("a secret that already contains id:secret is not prefixed again", async () => {
  const copied = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:secret-part";
  let authorization = "";
  const higgs = higgsfieldProvider({
    keyId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    keySecret: copied,
    fetchImpl: async (_url, init) => {
      authorization = init.headers.Authorization;
      if (init.method === "POST")
        return { ok: true, json: async () => ({ request_id: "req-2" }) };
      return { ok: true, json: async () => ({ status: "queued" }) };
    },
  });
  await higgs.submit({
    prompt: "go",
    imageUrl: "https://files.example/still.png",
    durationS: 5,
  });
  assert.equal(authorization, `Key ${copied}`);
  await higgs.poll("req-2");
  assert.equal(authorization, `Key ${copied}`);
});
