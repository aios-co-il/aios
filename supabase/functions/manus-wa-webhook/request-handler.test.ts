import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  assertSpyCalls,
  spy,
} from "https://deno.land/std@0.208.0/testing/mock.ts";
import { createWebhookHandler } from "./request-handler.ts";

function post(body: string): Request {
  return new Request("https://example.test/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

for (const payload of [null, [], "invalid", 42]) {
  Deno.test(
    `acks ${JSON.stringify(payload)} with 200 before processing`,
    async () => {
      const process = spy(() => Promise.resolve(new Response("processed")));
      const response = await createWebhookHandler(process)(
        post(JSON.stringify(payload)),
      );
      assertEquals(response.status, 200);
      assertEquals(await response.json(), {
        received: true,
        ignored: "invalid_payload",
      });
      assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
      assertSpyCalls(process, 0);
    },
  );
}

Deno.test("malformed JSON returns 500 without processing", async () => {
  const process = spy(() => Promise.resolve(new Response("processed")));
  const response = await createWebhookHandler(process)(post("{not json"));
  assertEquals(response.status, 500);
  assertEquals(typeof (await response.json()).error, "string");
  assertSpyCalls(process, 0);
});

Deno.test(
  "passes flat and wrapped objects unchanged to processing",
  async () => {
    for (const payload of [
      { instanceId: "test", body: "hi" },
      { data: { instanceId: "test", body: "hi" }, extra: 42 },
    ]) {
      const handler = createWebhookHandler((_request, received) => {
        assertEquals(received, payload);
        return Promise.resolve(new Response("processed"));
      });
      const response = await handler(post(JSON.stringify(payload)));
      assertEquals(await response.text(), "processed");
    }
  },
);

Deno.test("processing errors return 500 with the message", async () => {
  const handler = createWebhookHandler(() => Promise.reject(new Error("boom")));
  const response = await handler(post("{}"));
  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "boom" });
});

Deno.test("OPTIONS does not parse a body or invoke processing", async () => {
  const process = spy(() => Promise.resolve(new Response("processed")));
  const response = await createWebhookHandler(process)(
    new Request("https://example.test", { method: "OPTIONS" }),
  );
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
  assertSpyCalls(process, 0);
});
