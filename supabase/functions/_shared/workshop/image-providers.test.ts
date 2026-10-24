import assert from "node:assert/strict";
import { test } from "node:test";
import { aspectFor, generateStill } from "./image-providers.ts";

const png = Uint8Array.from([137, 80, 78, 71]);
const b64 = btoa(String.fromCharCode(...png));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

test("a missing key everywhere says what to connect", async () => {
  await assert.rejects(
    generateStill({}, "x", "1:1"),
    /אחד מ-OpenAI, Google או ElevenLabs/,
  );
});

test("OpenAI is used first and sized by aspect ratio", async () => {
  const seen: Record<string, unknown>[] = [];
  const made = await generateStill(
    { openai: "k", google: "g" },
    "a cat",
    "9:16",
    {
      fetchImpl: (async (_url: string, init: RequestInit) => {
        seen.push(JSON.parse(String(init.body)));
        return json({ data: [{ b64_json: b64 }] });
      }) as typeof fetch,
    },
  );
  assert.equal(made.provider, "openai");
  assert.deepEqual([...made.bytes], [...png]);
  assert.equal(seen[0].size, "1024x1536");
});

test("a failing OpenAI hands over to Google", async () => {
  const made = await generateStill(
    { openai: "k", google: "g" },
    "a cat",
    "1:1",
    {
      fetchImpl: (async () =>
        json(
          { error: { message: "billing_hard_limit_reached" } },
          400,
        )) as typeof fetch,
      gemini: async () => ({ bytes: png }),
    },
  );
  assert.equal(made.provider, "google");
});

test("ElevenLabs is polled until the picture is ready", async () => {
  const calls: string[] = [];
  let polls = 0;
  const made = await generateStill({ elevenlabs: "e" }, "a cat", "4:5", {
    sleep: async () => {},
    fetchImpl: (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        assert.equal(body.model_id, "gemini-3-pro-image");
        assert.equal(body.aspect_ratio, "4:5");
        return json({ id: "gen-1", status: "pending" });
      }
      if (url.endsWith("gen-1")) {
        polls += 1;
        return polls < 2
          ? json({ status: "pending" })
          : json({ status: "completed", content_url: "https://files/x.png" });
      }
      return new Response(png, { headers: { "content-type": "image/png" } });
    }) as typeof fetch,
  });
  assert.equal(made.provider, "elevenlabs");
  assert.deepEqual([...made.bytes], [...png]);
  assert.equal(polls, 2);
});

test("when every provider fails the error names each one", async () => {
  await assert.rejects(
    generateStill({ openai: "k", elevenlabs: "e" }, "x", "1:1", {
      sleep: async () => {},
      fetchImpl: (async () => json({ detail: "no" }, 401)) as typeof fetch,
    }),
    (error: Error) =>
      error.message.includes("OpenAI") && error.message.includes("ElevenLabs"),
  );
});

test("unknown ratios fall back to square", () => {
  assert.equal(aspectFor("2:7"), "1:1");
  assert.equal(aspectFor("4:5"), "4:5");
});
