import {
  assert,
  assertEquals,
  assertMatch,
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

Deno.test("ElevenLabs is polled until the picture is ready", async () => {
  const calls: string[] = [];
  let polls = 0;
  const made = await generateStill({ elevenlabs: "e" }, "a cat", "4:5", {
    sleep: async () => {},
    fetchImpl: (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        assertStrictEquals(body.model_id, "gemini-3-pro-image");
        assertStrictEquals(body.aspect_ratio, "4:5");
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
  assertStrictEquals(made.provider, "elevenlabs");
  assertEquals([...made.bytes], [...png]);
  assertStrictEquals(polls, 2);
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
  "OpenAI with references uses the edits endpoint with the pictures attached",
  async () => {
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
    assertStrictEquals(made.provider, "openai");
    assertMatch(url, /images\/edits$/);
    assertStrictEquals(form!.getAll("image[]").length, 1);
    assertStrictEquals(form!.get("size"), "1024x1536");
  },
);

Deno.test("ElevenLabs gets the references as inline images", async () => {
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
  assertStrictEquals(body.images[0].type, "inline_base64");
  assertStrictEquals(body.images[0].mime_type, "image/png");
  assertStrictEquals(body.images[0].content_base64, b64);
});

Deno.test(
  "references that cannot be read are reported, not skipped",
  async () => {
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
    assertStrictEquals(result.references.length, 1);
    assertStrictEquals(result.references[0].mime, "image/png");
    assertEquals(result.failed.sort(), [
      "https://x/gone.png",
      "https://x/page.html",
    ]);
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
  "Higgsfield uses Soul 2 text-to-image, or image-to-image with a reference link",
  async () => {
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
    assertStrictEquals(plain.provider, "higgsfield");
    assertMatch(seen[0].url, /soul\/v2\/standard$/);
    assertStrictEquals(seen[0].body!.aspect_ratio, "3:4");
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
    assertMatch(seen[1].url, /soul\/v2\/image-to-image$/);
    assertStrictEquals(seen[1].body!.image_url, "https://x/anchor.png");
  },
);

Deno.test(
  "engine names from the user or the model resolve to an engine id",
  async () => {
    const { normalizeEngine } = await import("./image-providers.ts");
    assertStrictEquals(normalizeEngine("elevenlabs"), "elevenlabs");
    assertStrictEquals(normalizeEngine("ElevenLabs"), "elevenlabs");
    assertStrictEquals(normalizeEngine("eleven_labs"), "elevenlabs");
    assertStrictEquals(normalizeEngine("אילוון לאבז"), "elevenlabs");
    assertStrictEquals(normalizeEngine("Nano Banana Pro"), "google");
    assertStrictEquals(normalizeEngine("גוגל"), "google");
    assertStrictEquals(normalizeEngine("higgsfield"), "higgsfield");
    assertStrictEquals(normalizeEngine("GPT image"), "openai");
    assertStrictEquals(normalizeEngine("midjourney"), null);
    assertStrictEquals(normalizeEngine(""), null);
    assertStrictEquals(normalizeEngine(undefined), null);
  },
);

Deno.test(
  "an ElevenLabs refusal says what is wrong with the account, not that it is disconnected",
  async () => {
    const { elevenLabsReason } = await import("./image-providers.ts");
    assertMatch(
      elevenLabsReason(402, '{"detail":{"status":"paid_plan_required"}}'),
      /תוכנית Pro/,
    );
    assertMatch(
      elevenLabsReason(401, '{"detail":{"status":"missing_permissions"}}'),
      /הרשאה Image & Video/,
    );
    assertMatch(
      elevenLabsReason(401, '{"detail":{"status":"invalid_api_key"}}'),
      /לא תקין/,
    );
    assertMatch(elevenLabsReason(500, "boom"), /^500 boom/);
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

Deno.test(
  "a Higgsfield job that was accepted and then failed does not fall through",
  async () => {
    const hosts: string[] = [];
    await assertRejects(
      () =>
        generateStill(
          { elevenlabs: "e", higgsfield: "id:secret", openai: "k" },
          "a cat",
          "1:1",
          {
            engine: "elevenlabs",
            sleep: async () => {},
            maxPolls: 2,
            fetchImpl: (async (url: string, init?: RequestInit) => {
              hosts.push(new URL(url).host);
              if (url.includes("elevenlabs"))
                return json({ detail: { status: "paid_plan_required" } }, 402);
              if (url.includes("openai"))
                return json({ data: [{ b64_json: b64 }] });
              if (init?.method === "POST") return json({ request_id: "req-1" });
              return json({ status: "in_progress" });
            }) as typeof fetch,
          },
        ),
      Error,
      "הזמן אזל",
    );
    assert(hosts.includes("api.higgsfield.ai"));
    assertStrictEquals(
      hosts.some((host) => host.includes("openai")),
      false,
    );
  },
);

/** ElevenLabs takes the job, then `poll` answers each status check; Higgsfield would make it. */
const acceptedByElevenLabs = (
  poll: (attempt: number) => Response,
  download = () => new Response(png),
) => {
  const hosts: string[] = [];
  let attempt = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    hosts.push(new URL(url).host);
    if (url.includes("higgsfield")) return json({ request_id: "req-1" });
    if (url.startsWith("https://files/")) return download();
    if (init?.method === "POST") return json({ id: "gen-1" });
    attempt += 1;
    return poll(attempt);
  }) as typeof fetch;
  return { hosts, fetchImpl };
};

Deno.test(
  "an ElevenLabs job that was accepted and then ran out of time does not fall through",
  async () => {
    const { hosts, fetchImpl } = acceptedByElevenLabs(() =>
      json({ status: "pending" }),
    );
    await assertRejects(
      () =>
        generateStill(
          { elevenlabs: "e", higgsfield: "id:secret" },
          "a cat",
          "1:1",
          { sleep: async () => {}, maxPolls: 2, fetchImpl },
        ),
      Error,
      "הזמן אזל",
    );
    assertStrictEquals(
      hosts.some((host) => host.includes("higgsfield")),
      false,
    );
  },
);

Deno.test(
  "a failed check or download of an accepted ElevenLabs job does not fall through",
  async () => {
    const cases = [
      acceptedByElevenLabs(() => json({ detail: "rate limited" }, 429)),
      acceptedByElevenLabs(
        () => json({ status: "completed", content_url: "https://files/x.png" }),
        () => new Response("gone", { status: 503 }),
      ),
    ];
    for (const { hosts, fetchImpl } of cases) {
      await assertRejects(() =>
        generateStill(
          { elevenlabs: "e", higgsfield: "id:secret" },
          "a cat",
          "1:1",
          { sleep: async () => {}, fetchImpl },
        ),
      );
      assertStrictEquals(
        hosts.some((host) => host.includes("higgsfield")),
        false,
        hosts.join(","),
      );
    }
  },
);

Deno.test(
  "an ElevenLabs job that ElevenLabs itself failed hands over to the next engine",
  async () => {
    const { hosts, fetchImpl } = acceptedByElevenLabs(() =>
      json({ status: "failed", failure_reason: "charging_failed" }),
    );
    await assertRejects(() =>
      generateStill(
        { elevenlabs: "e", higgsfield: "id:secret" },
        "a cat",
        "1:1",
        { sleep: async () => {}, maxPolls: 1, fetchImpl },
      ),
    );
    assert(hosts.some((host) => host.includes("higgsfield")));
  },
);
