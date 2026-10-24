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
    /אחד מ-OpenAI, Google, ElevenLabs או Higgsfield/,
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

test("references go to Gemini-based providers first and reach the request", async () => {
  const ref = { bytes: Uint8Array.from([137, 80, 78, 71]), mime: "image/png" };
  let sent: { images: Uint8Array[]; mimeTypes?: string[] } | null = null;
  const made = await generateStill(
    { openai: "k", google: "g" },
    "a cat",
    "1:1",
    {
      gemini: async (input) => {
        sent = input;
        return { bytes: png };
      },
    },
    [ref],
  );
  assert.equal(made.provider, "google");
  assert.equal(sent!.images.length, 1);
  assert.deepEqual(sent!.mimeTypes, ["image/png"]);
});

test("OpenAI with references uses the edits endpoint with the pictures attached", async () => {
  const ref = { bytes: Uint8Array.from([255, 216, 1]), mime: "image/jpeg" };
  let url = "";
  let form: FormData | null = null;
  const made = await generateStill(
    { openai: "k" },
    "a cat",
    "9:16",
    {
      fetchImpl: (async (u: string, init: RequestInit) => {
        url = u;
        form = init.body as FormData;
        return json({ data: [{ b64_json: b64 }] });
      }) as typeof fetch,
    },
    [ref],
  );
  assert.equal(made.provider, "openai");
  assert.match(url, /images\/edits$/);
  assert.equal(form!.getAll("image[]").length, 1);
  assert.equal(form!.get("size"), "1024x1536");
});

test("ElevenLabs gets the references as inline images", async () => {
  const ref = { bytes: Uint8Array.from([137, 80, 78, 71]), mime: "image/png" };
  let body: Record<string, any> = {};
  await generateStill(
    { elevenlabs: "e" },
    "a cat",
    "4:5",
    {
      sleep: async () => {},
      fetchImpl: (async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          body = JSON.parse(String(init.body));
          return json({ id: "g1" });
        }
        if (url.endsWith("/g1"))
          return json({ status: "completed", content_url: "https://c/x.png" });
        return new Response(png, { headers: { "content-type": "image/png" } });
      }) as typeof fetch,
    },
    [ref],
  );
  assert.equal(body.images[0].type, "inline_base64");
  assert.equal(body.images[0].mime_type, "image/png");
  assert.equal(body.images[0].content_base64, b64);
});

test("references that cannot be read are reported, not skipped", async () => {
  const { loadReferences } = await import("./image-providers.ts");
  const result = await loadReferences(
    ["https://x/ok.png", "https://x/gone.png", "https://x/page.html"],
    (async (url: string) =>
      url.endsWith("ok.png")
        ? new Response(png, { headers: { "content-type": "image/png" } })
        : url.endsWith("gone.png")
          ? new Response("", { status: 404 })
          : new Response("<html>", {
              headers: { "content-type": "text/html" },
            })) as unknown as typeof fetch,
  );
  assert.equal(result.references.length, 1);
  assert.equal(result.references[0].mime, "image/png");
  assert.deepEqual(result.failed.sort(), [
    "https://x/gone.png",
    "https://x/page.html",
  ]);
});

test("a chosen engine is used alone, with no fallback, and must be connected", async () => {
  await assert.rejects(
    generateStill({ openai: "k" }, "x", "1:1", { engine: "google" }),
    /Google \(Gemini\) לא מחובר/,
  );
  const calls: string[] = [];
  await assert.rejects(
    generateStill({ openai: "k", google: "g" }, "x", "1:1", {
      engine: "openai",
      fetchImpl: (async (url: string) => {
        calls.push(url);
        return json({ error: "no" }, 400);
      }) as typeof fetch,
      gemini: async () => {
        calls.push("gemini");
        return { bytes: png };
      },
    }),
    /OpenAI/,
  );
  assert.deepEqual(calls, ["https://api.openai.com/v1/images/generations"]);
});

test("Higgsfield uses Soul 2 text-to-image, or image-to-image with a reference link", async () => {
  const seen: { url: string; body?: Record<string, any> }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      seen.push({ url, body: JSON.parse(String(init.body)) });
      return json({ request_id: "r1" });
    }
    if (url.endsWith("/status"))
      return json({
        status: "completed",
        images: [{ url: "https://c/out.png" }],
      });
    return new Response(png, { headers: { "content-type": "image/png" } });
  }) as typeof fetch;
  const plain = await generateStill(
    { higgsfield: "id:secret" },
    "a cat",
    "4:5",
    {
      sleep: async () => {},
      fetchImpl,
    },
  );
  assert.equal(plain.provider, "higgsfield");
  assert.match(seen[0].url, /soul\/v2\/standard$/);
  assert.equal(seen[0].body!.aspect_ratio, "3:4");
  await generateStill(
    { higgsfield: "id:secret" },
    "a cat",
    "1:1",
    { sleep: async () => {}, fetchImpl },
    [
      { bytes: png, mime: "image/png", url: "https://x/ref.png" },
      { bytes: png, mime: "image/png", url: "https://x/anchor.png" },
    ],
  );
  assert.match(seen[1].url, /soul\/v2\/image-to-image$/);
  assert.equal(seen[1].body!.image_url, "https://x/anchor.png");
});

test("engine names from the user or the model resolve to an engine id", async () => {
  const { normalizeEngine } = await import("./image-providers.ts");
  assert.equal(normalizeEngine("elevenlabs"), "elevenlabs");
  assert.equal(normalizeEngine("ElevenLabs"), "elevenlabs");
  assert.equal(normalizeEngine("eleven_labs"), "elevenlabs");
  assert.equal(normalizeEngine("אילוון לאבז"), "elevenlabs");
  assert.equal(normalizeEngine("Nano Banana Pro"), "google");
  assert.equal(normalizeEngine("גוגל"), "google");
  assert.equal(normalizeEngine("higgsfield"), "higgsfield");
  assert.equal(normalizeEngine("GPT image"), "openai");
  assert.equal(normalizeEngine("midjourney"), null);
  assert.equal(normalizeEngine(""), null);
  assert.equal(normalizeEngine(undefined), null);
});

test("an ElevenLabs refusal says what is wrong with the account, not that it is disconnected", async () => {
  const { elevenLabsReason } = await import("./image-providers.ts");
  assert.match(
    elevenLabsReason(402, '{"detail":{"status":"paid_plan_required"}}'),
    /תוכנית Pro/,
  );
  assert.match(
    elevenLabsReason(401, '{"detail":{"status":"missing_permissions"}}'),
    /הרשאה Image & Video/,
  );
  assert.match(
    elevenLabsReason(401, '{"detail":{"status":"invalid_api_key"}}'),
    /לא תקין/,
  );
  assert.match(elevenLabsReason(500, "boom"), /^500 boom/);
});
