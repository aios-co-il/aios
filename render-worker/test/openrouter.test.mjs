import assert from "node:assert/strict";
import { test } from "node:test";
import { getVideoProvider } from "../src/providers/index.mjs";
import {
  openRouterClipBody,
  openRouterClipSeconds,
} from "../src/providers/openrouter.mjs";

test("OpenRouter clips send the still as the first frame, 3 to 15 s", () => {
  assert.equal(openRouterClipSeconds(2), 3);
  assert.equal(openRouterClipSeconds(40), 15);
  const body = openRouterClipBody({
    prompt: "p",
    imageUrl: "https://x/a.png",
    durationS: 5,
    model: "kwaivgi/kling-v3.0-std",
  });
  assert.equal(body.model, "kwaivgi/kling-v3.0-std");
  assert.equal(body.frame_images[0].frame_type, "first_frame");
  assert.equal(body.frame_images[0].image_url.url, "https://x/a.png");
  assert.throws(() => openRouterClipBody({ prompt: "p" }), /public image_url/);
});

test("OpenRouter submits, polls and downloads with the tenant key", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, auth: init.headers?.Authorization });
    if (url.endsWith("/videos"))
      return new Response(JSON.stringify({ id: "job1", status: "pending" }));
    if (url.endsWith("/videos/job1"))
      return new Response(JSON.stringify({ status: "completed" }));
    return new Response(new Uint8Array([1, 2, 3]));
  };
  const provider = getVideoProvider("openrouter", { openRouterKey: "sk-or" });
  assert.equal(provider.name, "openrouter");
  // getVideoProvider builds with the real fetch; rebuild with the fake one.
  const { openRouterProvider } =
    await import("../src/providers/openrouter.mjs");
  const p = openRouterProvider({ apiKey: "sk-or", fetchImpl });
  assert.deepEqual(
    await p.submit({ prompt: "p", imageUrl: "https://x/a.png", durationS: 5 }),
    { jobId: "job1" },
  );
  const result = await p.poll("job1");
  assert.equal(result.status, "succeeded");
  assert.deepEqual([...result.bytes], [1, 2, 3]);
  assert.ok(calls.every((c) => c.auth === "Bearer sk-or"));
  assert.match(calls[2].url, /\/videos\/job1\/content\?index=0$/);
});

const json = (status, body) => new Response(JSON.stringify(body), { status });

test("lengths and aspects follow the model family", async () => {
  const { openRouterAspect } = await import("../src/providers/openrouter.mjs");
  assert.equal(openRouterClipSeconds(5, "google/veo-3.1"), 6);
  assert.equal(openRouterClipSeconds(3, "google/veo-3.1-fast"), 4);
  assert.equal(openRouterClipSeconds(12, "google/veo-3.1"), 8);
  assert.equal(openRouterClipSeconds(2, "bytedance/seedance-2.5"), 4);
  assert.equal(openRouterClipSeconds(40, "bytedance/seedance-2.5"), 30);
  assert.equal(openRouterClipSeconds(20, "kwaivgi/kling-v3.0-pro"), 15);
  assert.equal(openRouterAspect("1:1", "google/veo-3.1"), "9:16");
  assert.equal(openRouterAspect("1:1", "kwaivgi/kling-v3.0-std"), "1:1");
  assert.equal(openRouterAspect("4:5", "kwaivgi/kling-v3.0-std"), "9:16");
  const body = openRouterClipBody({
    prompt: "p",
    imageUrl: "https://x/a.png",
    durationS: 5,
    aspect: "16:9",
    model: "kwaivgi/kling-v3.0-std",
  });
  assert.equal(body.aspect_ratio, "16:9");
  assert.equal(body.generate_audio, false);
  assert.equal(body.duration, 5);
});

test("a talking scene goes to the talking model with audio and the Hebrew line", async () => {
  const { openRouterProvider } =
    await import("../src/providers/openrouter.mjs");
  const sent = [];
  const fetchImpl = async (url, init = {}) => {
    sent.push(JSON.parse(init.body));
    return json(202, { id: "talk1", status: "pending" });
  };
  const p = openRouterProvider({ apiKey: "sk-or", fetchImpl });
  assert.equal(p.nativeSpeech, true);
  assert.equal(p.talkingModel, "google/veo-3.1");
  const result = await p.submit({
    prompt: 'The character says in Hebrew: "שלום לכולם".',
    imageUrl: "https://x/a.png",
    durationS: 5,
    aspect: "9:16",
    talking: true,
  });
  assert.deepEqual(result, { jobId: "talk1", model: "google/veo-3.1" });
  assert.equal(sent[0].model, "google/veo-3.1");
  assert.equal(sent[0].generate_audio, true);
  assert.equal(sent[0].duration, 6);
  assert.match(sent[0].prompt, /שלום לכולם/);
  assert.equal(p.estimate({ durationS: 5, talking: true }).usd, 2.4);
  assert.equal(p.estimate({ durationS: 5 }).usd, 0.42);
});

test("a refused submit is marked as before submit so the clip can fall back", async () => {
  const { openRouterProvider } =
    await import("../src/providers/openrouter.mjs");
  const p = openRouterProvider({
    apiKey: "sk-or",
    fetchImpl: async () =>
      json(402, { error: { message: "Insufficient credits" } }),
  });
  const error = await p
    .submit({ prompt: "p", imageUrl: "https://x/a.png" })
    .catch((caught) => caught);
  assert.equal(error.submitted, false);
  assert.equal(error.status, 402);
  assert.match(error.message, /openrouter submit 402/);
});

test("poll maps failed, cancelled and expired to failed and the rest to pending", async () => {
  const { openRouterProvider } =
    await import("../src/providers/openrouter.mjs");
  const answers = [
    json(200, { status: "in_progress" }),
    json(200, { status: "failed", error: "content policy" }),
    json(200, { status: "cancelled" }),
    json(200, { status: "expired" }),
  ];
  const p = openRouterProvider({
    apiKey: "k",
    fetchImpl: async () => answers.shift(),
  });
  assert.deepEqual(await p.poll("j"), { status: "pending" });
  assert.deepEqual(await p.poll("j"), {
    status: "failed",
    error: "content policy",
  });
  assert.equal((await p.poll("j")).status, "failed");
  assert.equal((await p.poll("j")).status, "failed");
});

test("OpenRouter without a key fails before any request", async () => {
  const p = getVideoProvider("openrouter", {});
  await assert.rejects(
    p.submit({ prompt: "p", imageUrl: "https://x/a.png" }),
    /OpenRouter brain/,
  );
});
