import assert from "node:assert/strict";
import test from "node:test";
import { generateOpenRouterImage } from "./openrouterImage.ts";

test("OpenRouter images come back as base64 with the model used", async () => {
  let body: Record<string, unknown> = {};
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({
        data: [{ b64_json: "aGk=", media_type: "image/webp" }],
        usage: { cost: 0.04 },
      }),
    );
  }) as typeof fetch;
  const out = await generateOpenRouterImage({
    apiKey: "sk-or",
    prompt: "p",
    aspectRatio: "9:16",
    fetchImpl,
  });
  assert.equal(body.aspect_ratio, "9:16");
  assert.equal(body.model, "google/gemini-3.1-flash-image");
  assert.deepEqual(out, {
    b64: "aGk=",
    mediaType: "image/webp",
    model: "google/gemini-3.1-flash-image",
    usd: 0.04,
  });
});

test("an OpenRouter error is thrown, so the caller can fall back", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: { message: "no" } }), {
      status: 502,
    })) as typeof fetch;
  await assert.rejects(
    generateOpenRouterImage({ apiKey: "k", prompt: "p", fetchImpl }),
    /OpenRouter image 502/,
  );
});
