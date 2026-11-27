import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../database.types.ts";
import { remoteAdImage } from "./ad-image-remote.ts";

const args = { prompt: "a cafe at dawn", aspect_ratio: "9:16" };

/** Exercises the SDK invocation while intercepting only HTTP. */
function client(respond: (request: Request) => Response) {
  const seen: Array<Request> = [];
  const supabase = createClient<Database>("https://ref.supabase.co", "svc", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        seen.push(request.clone());
        return respond(request);
      },
    },
  });
  return { supabase, seen };
}

Deno.test("a picture uses the existing service client and tenant", async () => {
  const fixture = client(() => Response.json({ image_url: "https://x/p.png" }));
  assertEquals(await remoteAdImage(fixture.supabase, "t1", args), {
    image_url: "https://x/p.png",
  });
  const request = fixture.seen[0];
  assertEquals(
    request.url,
    "https://ref.supabase.co/functions/v1/workshop-image",
  );
  assertEquals(request.headers.get("authorization"), "Bearer svc");
  assertEquals(request.headers.get("apikey"), "svc");
  assertEquals(await request.json(), { tenant_id: "t1", ...args });
});

Deno.test("only a missing function permits local image fallback", async () => {
  const fixture = client(() => new Response("not found", { status: 404 }));
  assertEquals(await remoteAdImage(fixture.supabase, "t1", args), {
    error: "workshop-image is not deployed",
    missing: true,
  });
});

Deno.test(
  "provider, HTTP and transport errors retain their response",
  async () => {
    const refused = client(() =>
      Response.json({ error: "no credits" }, { status: 500 }),
    );
    assertEquals(await remoteAdImage(refused.supabase, "t1", args), {
      error: "no credits",
    });
    const killed = client(() => new Response("WORKER_LIMIT", { status: 546 }));
    const made = await remoteAdImage(killed.supabase, "t1", args);
    assert("error" in made && /546/.test(made.error));
    assertEquals("missing" in made, false);
    const down = client(() => {
      throw new Error("socket hang up");
    });
    const lost = await remoteAdImage(down.supabase, "t1", args);
    assert("error" in lost && /socket hang up/.test(lost.error));
  },
);

Deno.test(
  "HTTP status does not discard an image and malformed JSON retains the generic error",
  async () => {
    const image = client(() =>
      Response.json({ image_url: "https://x/p.png" }, { status: 500 }),
    );
    assertEquals(await remoteAdImage(image.supabase, "t1", args), {
      image_url: "https://x/p.png",
    });
    const invalid = client(
      () =>
        new Response("{", { headers: { "Content-Type": "application/json" } }),
    );
    assertEquals(await remoteAdImage(invalid.supabase, "t1", args), {
      error: "יצירת התמונה נכשלה (200)",
    });
  },
);
