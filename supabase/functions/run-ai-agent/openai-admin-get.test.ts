import { assertEquals } from "jsr:@std/assert@1";
import { openaiAdminGet } from "./openai-admin-get.ts";

Deno.test(
  "OpenAI admin HTTP errors preserve status and redact response fallbacks",
  async (t) => {
    await t.step(
      "object-valued messages use the redacted body rather than object coercion",
      async () => {
        const payload = { message: { api_key: "sk-secretkey0123456789" } };
        const result = await openaiAdminGet(
          "/organization/costs",
          "fixture-key",
          async (input, init) => {
            assertEquals(
              String(input),
              "https://api.openai.com/v1/organization/costs",
            );
            assertEquals(
              new Headers(init?.headers).get("Authorization"),
              "Bearer fixture-key",
            );
            return new Response(JSON.stringify(payload), { status: 429 });
          },
        );
        assertEquals(result, {
          ok: false,
          status: 429,
          json: payload,
          error: JSON.stringify({ message: { api_key: "sk-***" } }),
        });
      },
    );

    await t.step(
      "valid nested and top-level error messages keep their precedence",
      async () => {
        for (const [payload, expected] of [
          [{ error: { message: "Nested" }, message: "Top" }, "Nested"],
          [{ error: { message: {} }, message: "Top" }, "Top"],
        ] as const) {
          const result = await openaiAdminGet(
            "/organization/costs",
            "fixture",
            async () => new Response(JSON.stringify(payload), { status: 403 }),
          );
          assertEquals(result.status, 403);
          assertEquals(result.error, expected);
        }
      },
    );

    await t.step(
      "empty bodies use the HTTP status and success bodies remain readable",
      async () => {
        const failure = await openaiAdminGet(
          "/organization/costs",
          "fixture",
          async () => new Response(null, { status: 503 }),
        );
        assertEquals(failure, {
          ok: false,
          status: 503,
          json: null,
          error: "HTTP 503",
        });
        const success = await openaiAdminGet(
          "/organization/costs",
          "fixture",
          async () => new Response('{"data":[]}', { status: 200 }),
        );
        assertEquals(success, { ok: true, status: 200, json: { data: [] } });
      },
    );
  },
);
