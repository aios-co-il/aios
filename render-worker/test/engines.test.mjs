import { expect, test } from "vitest";
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
  expect(elevenLabsClipSeconds(3)).toBe(4);
  expect(elevenLabsClipSeconds(6)).toBe(6);
  expect(elevenLabsClipSeconds(9)).toBe(8);
  expect(elevenLabsAspect("16:9")).toBe("16:9");
  expect(elevenLabsAspect("4:5")).toBe("9:16");
  const body = elevenLabsVideoBody({
    prompt: "Camera pushes in",
    imageBytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
    durationS: 3,
    aspect: "9:16",
    generateAudio: false,
    model: "veo-3.1-fast-generate-001",
  });
  expect(body.model_id).toBe("veo-3.1-fast-generate-001");
  expect(body.duration_secs).toBe(4);
  expect(body.generate_audio).toBe(false);
  expect(body.start_frame.mime_type).toBe("image/png");
  expect(body.start_frame.type).toBe("inline_base64");
});

test("Higgsfield sends the signed still and keeps the scene length", () => {
  expect(higgsfieldClipSeconds(3.2)).toBe(4);
  expect(higgsfieldClipSeconds(30)).toBe(15);
  expect(() => higgsfieldClipBody({ prompt: "move", durationS: 5 })).toThrow();
  expect(
    higgsfieldClipBody({
      prompt: "move",
      imageUrl: "https://files.example/still.png",
      durationS: 5,
      generateAudio: true,
    }),
  ).toStrictEqual({
    prompt: "move",
    image_url: "https://files.example/still.png",
    duration: 5,
    resolution: "720p",
    generate_audio: true,
    negative_prompt: "text, letters, captions, logo, watermark",
  });
});

test("the worker can build every scene engine and sound request", () => {
  expect(getVideoProvider("mock").name).toBe("mock");
  expect(getVideoProvider("elevenlabs", { elevenLabsKey: "xi" }).name).toBe(
    "elevenlabs",
  );
  expect(
    getVideoProvider("higgsfield", {
      higgsfieldKeyId: "id",
      higgsfieldKeySecret: "secret",
    }).name,
  ).toBe("higgsfield");
  expect(speechBody("שלום", "eleven_v4").model_id).toBe("eleven_v4");
  expect(musicBody({ prompt: "bed", musicLengthMs: 8000 }).model_id).toBe(
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
  expect(
    (await eleven.submit({ prompt: "go", durationS: 5, aspect: "16:9" })).jobId,
  ).toBe("gen-1");
  expect((await eleven.poll("gen-1")).status).toBe("succeeded");
  expect(elevenCalls[0].body.model_id).toBe("veo-3.1-fast-generate-001");

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
  expect(
    (
      await higgs.submit({
        prompt: "go",
        imageUrl: "https://files.example/still.png",
        durationS: 5,
      })
    ).jobId,
  ).toBe("req-1");
  expect((await higgs.poll("req-1")).url).toBe("https://files.example/hf.mp4");
});
