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

test("OpenRouter without a key fails before any request", async () => {
  const p = getVideoProvider("openrouter", {});
  await assert.rejects(
    p.submit({ prompt: "p", imageUrl: "https://x/a.png" }),
    /OpenRouter brain/,
  );
});
