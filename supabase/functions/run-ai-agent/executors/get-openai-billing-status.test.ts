import { assert, assertEquals } from "jsr:@std/assert@1";
import { executeGetOpenaiBillingStatus } from "./get-openai-billing-status.ts";
import { executorClient } from "./executor-client.test-fixture.ts";
import { OPENAI_BILLING_REFUSAL_HE } from "../../_shared/openai-billing.ts";

Deno.test(
  "billing executor preserves authorization and invocation contracts",
  async (t) => {
    const names = ["OPENAI_ADMIN_KEY", "OPENAI_ADMIN_API_KEY"];
    const previous = names.map((name) => Deno.env.get(name));
    const originalFetch = globalThis.fetch;
    Deno.env.delete(names[0]);
    Deno.env.delete(names[1]);
    const requests: Array<URL> = [];
    globalThis.fetch = (input) => {
      requests.push(new URL(input instanceof Request ? input.url : input));
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    };
    try {
      await t.step(
        "non-admin refusal precedes database reads and HTTP requests",
        async () => {
          const fixture = executorClient([], 200, { callerRole: "member" });

          assertEquals(
            await executeGetOpenaiBillingStatus({}, fixture.context),
            { error: OPENAI_BILLING_REFUSAL_HE, allowed: false },
          );
          assertEquals(fixture.calls.length, 0);
          assertEquals(requests.length, 0);
        },
      );

      await t.step(
        "include_tokens defaults on and false skips only usage",
        async () => {
          Deno.env.set(names[0], "test-admin-key");
          for (const include_tokens of [undefined, false]) {
            requests.length = 0;
            const fixture = executorClient([], 200, {
              callerRole: "super_admin",
            });

            await executeGetOpenaiBillingStatus(
              { include_tokens },
              fixture.context,
            );

            assertEquals(
              requests.some((url) => url.pathname.endsWith("/costs")),
              true,
            );
            assertEquals(
              requests.some((url) =>
                url.pathname.endsWith("/usage/completions"),
              ),
              include_tokens !== false,
            );
            assertEquals(
              requests.some((url) => url.pathname.endsWith("/spend_limits")),
              true,
            );
            assertEquals(fixture.calls.length, 0);
          }
          Deno.env.delete(names[0]);
        },
      );

      await t.step(
        "database errors retain the public failure shape without private details",
        async () => {
          const fixture = executorClient(
            [{ message: "private-database-secret" }],
            500,
            { callerRole: "super_admin" },
          );
          const result = await executeGetOpenaiBillingStatus(
            {},
            fixture.context,
          );

          assert("ok" in result);
          assertEquals(result.ok, false);
          assertEquals(result.error, "OpenAI admin key lookup failed");
          assertEquals(result.remaining_credit, null);
          assertEquals(result.remaining_credit_available, false);
          assertEquals(
            JSON.stringify(result).includes("private-database-secret"),
            false,
          );
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
      for (const [index, name] of names.entries()) {
        const value = previous[index];
        if (value === undefined) {
          Deno.env.delete(name);
        } else {
          Deno.env.set(name, value);
        }
      }
    }
  },
);
