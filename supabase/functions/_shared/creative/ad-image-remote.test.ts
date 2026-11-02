import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { remoteAdImage } from "./ad-image-remote.ts";

const call = (respond: (url: string, init: RequestInit) => Response) => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof fetch;
  return { seen, fetchImpl };
};

const args = { prompt: "a cafe at dawn", aspect_ratio: "9:16" };

Deno.test(
  "a picture is made by workshop-image with the service key and the tenant",
  async () => {
    const { seen, fetchImpl } = call(() =>
      Response.json({ success: true, image_url: "https://x/p.png" }),
    );
    const made = await remoteAdImage(
      "https://ref.supabase.co",
      "svc",
      "t1",
      args,
      fetchImpl,
    );
    assertEquals(made, { image_url: "https://x/p.png" });
    assertStrictEquals(
      seen[0].url,
      "https://ref.supabase.co/functions/v1/workshop-image",
    );
    const headers = seen[0].init.headers as Record<string, string>;
    assertStrictEquals(headers.Authorization, "Bearer svc");
    assertEquals(JSON.parse(String(seen[0].init.body)), {
      tenant_id: "t1",
      ...args,
    });
  },
);

Deno.test(
  "a function that is not deployed lets the caller make the picture itself",
  async () => {
    const { fetchImpl } = call(
      () => new Response("not found", { status: 404 }),
    );
    const made = await remoteAdImage("https://r", "svc", "t1", args, fetchImpl);
    assertStrictEquals("missing" in made && made.missing, true);
  },
);

Deno.test(
  "a provider error or a cut-off request comes back as an error, not a retry",
  async () => {
    const refused = call(() =>
      Response.json({ success: false, error: "no credits" }),
    );
    assertEquals(
      await remoteAdImage("https://r", "svc", "t1", args, refused.fetchImpl),
      { error: "no credits" },
    );
    const killed = call(() => new Response("WORKER_LIMIT", { status: 546 }));
    const made = await remoteAdImage(
      "https://r",
      "svc",
      "t1",
      args,
      killed.fetchImpl,
    );
    assert("error" in made && /546/.test(made.error));
    assertStrictEquals("missing" in made, false);
    const down = (async () => {
      throw new Error("socket hang up");
    }) as unknown as typeof fetch;
    const lost = await remoteAdImage("https://r", "svc", "t1", args, down);
    assert("error" in lost && /socket hang up/.test(lost.error));
  },
);
