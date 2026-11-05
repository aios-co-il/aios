import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { aspectFor, generateStill } from "./image-providers.ts";

const png = Uint8Array.from([137, 80, 78, 71]);
const b64 = btoa(String.fromCharCode(...png));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

Deno.test("a missing key everywhere says what to connect", async () => {
  await assertRejects(
    () => generateStill({}, "x", "1:1"),
    Error,
    "אחד מ-OpenAI, Google, ElevenLabs או Higgsfield",
  );
});

Deno.test("OpenAI is used first and sized by aspect ratio", async () => {
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
  assertStrictEquals(made.provider, "openai");
  assertEquals([...made.bytes], [...png]);
  assertStrictEquals(seen[0].size, "1024x1536");
  assertStrictEquals(seen[0].model, "gpt-image-2.5-sunburst");
});

Deno.test("a failing OpenAI hands over to Google", async () => {
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
  assertStrictEquals(made.provider, "google");
});

Deno.test("when every provider fails the error names each one", async () => {
  const error = await assertRejects(
    () =>
      generateStill({ openai: "k", elevenlabs: "e" }, "x", "1:1", {
        sleep: async () => {},
        fetchImpl: (async () => json({ detail: "no" }, 401)) as typeof fetch,
      }),
    Error,
  );
  assert(error.message.includes("OpenAI"));
  assert(error.message.includes("ElevenLabs"));
});

Deno.test("unknown ratios fall back to square", () => {
  assertStrictEquals(aspectFor("2:7"), "1:1");
  assertStrictEquals(aspectFor("4:5"), "4:5");
});

Deno.test(
  "references go to Gemini-based providers first and reach the request",
  async () => {
    const ref = {
      bytes: Uint8Array.from([137, 80, 78, 71]),
      mime: "image/png",
    };
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
    assertStrictEquals(made.provider, "google");
    assertStrictEquals(sent!.images.length, 1);
    assertEquals(sent!.mimeTypes, ["image/png"]);
  },
);

Deno.test(
  "a chosen engine is used alone, with no fallback, and must be connected",
  async () => {
    await assertRejects(
      () => generateStill({ openai: "k" }, "x", "1:1", { engine: "google" }),
      Error,
      "Google (Gemini) לא מחובר",
    );
    const calls: string[] = [];
    await assertRejects(
      () =>
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
      Error,
      "OpenAI",
    );
    assertEquals(calls, ["https://api.openai.com/v1/images/generations"]);
  },
);

Deno.test(
  "a pinned ElevenLabs Starter plan falls through to Google",
  async () => {
    const made = await generateStill(
      { elevenlabs: "e", google: "g" },
      "a cat",
      "1:1",
      {
        engine: "elevenlabs",
        sleep: async () => {},
        gemini: async () => ({ bytes: png }),
        fetchImpl: (async () =>
          json(
            { detail: { status: "paid_plan_required" } },
            402,
          )) as typeof fetch,
      },
    );
    assertStrictEquals(made.provider, "google");
  },
);

Deno.test(
  "a provider that times out is not followed by a second, possibly paid, engine",
  async () => {
    let geminiCalls = 0;
    await assertRejects(
      () =>
        generateStill({ openai: "k", google: "g" }, "a cat", "1:1", {
          fetchImpl: (async () => {
            throw new DOMException("timed out", "TimeoutError");
          }) as typeof fetch,
          gemini: async () => {
            geminiCalls += 1;
            return { bytes: png };
          },
        }),
      Error,
      "לא ענה בזמן",
    );
    assertStrictEquals(geminiCalls, 0);
  },
);
