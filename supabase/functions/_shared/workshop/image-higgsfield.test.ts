import {
  assert,
  assertMatch,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { generateStill } from "./image-providers.ts";

const png = Uint8Array.from([137, 80, 78, 71]);
const b64 = btoa(String.fromCharCode(...png));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

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
