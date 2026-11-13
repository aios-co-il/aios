import { assertEquals } from "jsr:@std/assert@1";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@1/bdd";

import { startVideoStorage } from "./meeting-bot-finalize.ts";

const SESSION = { id: "session-1", tenant_id: "tenant-1" };

interface SentRequest {
  url: string;
  headers: Headers;
  body: unknown;
}

describe("startVideoStorage", () => {
  const realError = console.error;
  let errors: Array<string> = [];

  beforeEach(() => {
    Deno.env.set("SUPABASE_URL", "https://db.test");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    errors = [];
    console.error = (...args: Array<unknown>) => {
      errors.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.error = realError;
  });

  it("asks meeting-bot-store-video to store the session's video as the service role", async () => {
    const sent: Array<SentRequest> = [];
    await startVideoStorage(SESSION, (input, init) => {
      sent.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      });
      return Promise.resolve(Response.json({ stored: true }));
    });

    assertEquals(sent.length, 1);
    assertEquals(
      sent[0].url,
      "https://db.test/functions/v1/meeting-bot-store-video",
    );
    assertEquals(sent[0].headers.get("authorization"), "Bearer service-key");
    assertEquals(sent[0].body, {
      session_id: "session-1",
      tenant_id: "tenant-1",
    });
    assertEquals(errors, []);
  });

  it("logs a non-2xx answer with the session id", async () => {
    await startVideoStorage(SESSION, () =>
      Promise.resolve(new Response("boom", { status: 500 })),
    );

    assertEquals(errors.length, 1);
    assertEquals(errors[0].includes("session session-1 (500)"), true);
  });

  it("logs a request that never reaches the function", async () => {
    await startVideoStorage(SESSION, () =>
      Promise.reject(new Error("offline")),
    );

    assertEquals(errors.length, 1);
    assertEquals(
      errors[0].includes("request failed for session session-1"),
      true,
    );
  });
});
