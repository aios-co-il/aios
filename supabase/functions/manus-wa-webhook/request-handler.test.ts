import { assertSpyCalls, spy } from "jsr:@std/testing@1/mock";
import { createWebhookHandler } from "./request-handler.ts";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

for (const variant of ["body", "header", "query"]) {
  for (const payload of [null, [], "invalid", 42]) {
    Deno.test(
      `ACKs ${JSON.stringify(payload)} with ${variant} instance before database access`,
      async () => {
        const failedHandler = spy(async () => {
          throw new Error("Unexpected database access");
        });
        const handler = createWebhookHandler(failedHandler);
        const response = await handler(
          new Request(
            `https://example.test/webhook${variant === "query" ? "?instanceId=test" : ""}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(variant === "header"
                  ? { "x-wa-gateway-instance": "test" }
                  : {}),
              },
              body: JSON.stringify(payload),
            },
          ),
        );
        assert(response.status === 200, "Expected invalid-payload ACK");
        const body = await response.json();
        assert(body.received === true, "Expected received marker");
        assert(
          body.ignored === "invalid_payload",
          "Expected invalid-payload ignored marker",
        );
        assertSpyCalls(failedHandler, 0);
      },
    );
  }
}
Deno.test(
  "passes flat and wrapped objects unchanged to processing",
  async () => {
    for (const payload of [
      { instanceId: "test", body: "hi" },
      { data: { instanceId: "test", body: "hi" }, extra: 42 },
    ]) {
      const handler = createWebhookHandler(async (_request, received) => {
        assert(
          JSON.stringify(received) === JSON.stringify(payload),
          "Payload changed",
        );
        return new Response("processed");
      });
      const response = await handler(
        new Request("https://example.test", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      );
      assert(
        (await response.text()) === "processed",
        "Expected downstream response",
      );
    }
  },
);
Deno.test("OPTIONS does not parse a body or invoke processing", async () => {
  const handler = createWebhookHandler(async () => {
    throw new Error("Unexpected processing");
  });
  const response = await handler(
    new Request("https://example.test", { method: "OPTIONS" }),
  );
  assert(response.status === 200, "Expected preflight success");
  assert(
    response.headers.get("Access-Control-Allow-Origin") === "*",
    "Expected CORS header",
  );
});
