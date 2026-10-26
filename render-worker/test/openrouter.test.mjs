import { expect, test } from "vitest";
import { getVideoProvider } from "../src/providers/index.mjs";
import {
  openRouterClipBody,
  openRouterClipSeconds,
} from "../src/providers/openrouter.mjs";

test("OpenRouter clips send the still as the first frame, 3 to 15 s", () => {
  expect(openRouterClipSeconds(2)).toBe(3);
  expect(openRouterClipSeconds(40)).toBe(15);
  const body = openRouterClipBody({
    prompt: "p",
    imageUrl: "https://x/a.png",
    durationS: 5,
    model: "kwaivgi/kling-v3.0-std",
  });
  expect(body.model).toBe("kwaivgi/kling-v3.0-std");
  expect(body.frame_images[0].frame_type).toBe("first_frame");
  expect(body.frame_images[0].image_url.url).toBe("https://x/a.png");
  expect(() => openRouterClipBody({ prompt: "p" })).toThrow(/public image_url/);
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
  expect(provider.name).toBe("openrouter");
  // getVideoProvider builds with the real fetch; rebuild with the fake one.
  const { openRouterProvider } =
    await import("../src/providers/openrouter.mjs");
  const p = openRouterProvider({ apiKey: "sk-or", fetchImpl });
  expect(
    await p.submit({ prompt: "p", imageUrl: "https://x/a.png", durationS: 5 }),
  ).toStrictEqual({ jobId: "job1" });
  const result = await p.poll("job1");
  expect(result.status).toBe("succeeded");
  expect([...result.bytes]).toStrictEqual([1, 2, 3]);
  expect(calls.every((c) => c.auth === "Bearer sk-or")).toBeTruthy();
  expect(calls[2].url).toMatch(/\/videos\/job1\/content\?index=0$/);
});

const json = (status, body) => new Response(JSON.stringify(body), { status });

test("lengths and aspects follow the model family", async () => {
  const { openRouterAspect } = await import("../src/providers/openrouter.mjs");
  expect(openRouterClipSeconds(5, "google/veo-3.1")).toBe(6);
  expect(openRouterClipSeconds(3, "google/veo-3.1-fast")).toBe(4);
  expect(openRouterClipSeconds(12, "google/veo-3.1")).toBe(8);
  expect(openRouterClipSeconds(2, "bytedance/seedance-2.5")).toBe(4);
  expect(openRouterClipSeconds(40, "bytedance/seedance-2.5")).toBe(30);
  expect(openRouterClipSeconds(20, "kwaivgi/kling-v3.0-pro")).toBe(15);
  expect(openRouterAspect("1:1", "google/veo-3.1")).toBe("9:16");
  expect(openRouterAspect("1:1", "kwaivgi/kling-v3.0-std")).toBe("1:1");
  expect(openRouterAspect("4:5", "kwaivgi/kling-v3.0-std")).toBe("9:16");
  const body = openRouterClipBody({
    prompt: "p",
    imageUrl: "https://x/a.png",
    durationS: 5,
    aspect: "16:9",
    model: "kwaivgi/kling-v3.0-std",
  });
  expect(body.aspect_ratio).toBe("16:9");
  expect(body.generate_audio).toBe(false);
  expect(body.duration).toBe(5);
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
  expect(p.nativeSpeech).toBe(true);
  expect(p.talkingModel).toBe("google/veo-3.1");
  const result = await p.submit({
    prompt: 'The character says in Hebrew: "שלום לכולם".',
    imageUrl: "https://x/a.png",
    durationS: 5,
    aspect: "9:16",
    talking: true,
  });
  expect(result).toStrictEqual({ jobId: "talk1", model: "google/veo-3.1" });
  expect(sent[0].model).toBe("google/veo-3.1");
  expect(sent[0].generate_audio).toBe(true);
  expect(sent[0].duration).toBe(6);
  expect(sent[0].prompt).toMatch(/שלום לכולם/);
  expect(p.estimate({ durationS: 5, talking: true }).usd).toBe(2.4);
  expect(p.estimate({ durationS: 5 }).usd).toBe(0.42);
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
  expect(error.submitted).toBe(false);
  expect(error.status).toBe(402);
  expect(error.message).toMatch(/openrouter submit 402/);
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
  expect(await p.poll("j")).toStrictEqual({ status: "pending" });
  expect(await p.poll("j")).toStrictEqual({
    status: "failed",
    error: "content policy",
  });
  expect((await p.poll("j")).status).toBe("failed");
  expect((await p.poll("j")).status).toBe("failed");
});

test("OpenRouter without a key fails before any request", async () => {
  const p = getVideoProvider("openrouter", {});
  await expect(
    p.submit({ prompt: "p", imageUrl: "https://x/a.png" }),
  ).rejects.toThrow(/OpenRouter brain/);
});

test("a short Kling clip is estimated at OpenRouter's 5 s minimum, and the real charge is returned", async () => {
  const { openRouterProvider } =
    await import("../src/providers/openrouter.mjs");
  const p = openRouterProvider({
    apiKey: "k",
    fetchImpl: async (url) =>
      String(url).endsWith("/content?index=0")
        ? new Response(new Uint8Array([1, 2]))
        : Response.json({ status: "completed", usage: { cost: 0.42 } }),
  });
  expect(p.estimate({ durationS: 3 }).usd).toBe(0.42);
  const done = await p.poll("job-1");
  expect(done.status).toBe("succeeded");
  expect(done.costUsd).toBe(0.42);
});
