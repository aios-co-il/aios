import {
  assert,
  assertEquals,
  assertMatch,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { generateStill } from "./image-providers.ts";

const png = Uint8Array.from([137, 80, 78, 71]);
const b64 = btoa(String.fromCharCode(...png));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

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
  "an ElevenLabs refusal says what is wrong with the account, not that it is disconnected",
  async () => {
    const { elevenLabsReason } = await import("./image-elevenlabs.ts");
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
