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

test("OpenRouter without a key fails before any request", async () => {
  const p = getVideoProvider("openrouter", {});
  await expect(
    p.submit({ prompt: "p", imageUrl: "https://x/a.png" }),
  ).rejects.toThrow(/OpenRouter brain/);
});
