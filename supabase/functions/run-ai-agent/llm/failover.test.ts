import { assertEquals } from "jsr:@std/assert@1";
import { executorClient } from "../executors/executor-client.test-fixture.ts";
import { recordProviderFailover } from "./failover.ts";

Deno.test(
  "failover deduplication is scoped to the reporting tenant",
  async () => {
    const fixture = executorClient([], 200, {}, undefined, (url) => {
      if (
        url.pathname.endsWith("integration_alerts_log") &&
        !url.searchParams.has("tenant_id")
      ) {
        return [{ id: "other-tenant-alert" }];
      }
      return url.searchParams.has("tenant_id") ? [] : null;
    });

    await recordProviderFailover(
      fixture.context.supabase,
      "t1",
      "google/a",
      "openai/b",
      "quota",
    );

    assertEquals(
      new URL(fixture.calls[0].url).searchParams.get("tenant_id"),
      "eq.t1",
    );
    assertEquals(
      fixture.calls.map((call) => call.method),
      ["GET", "POST", "POST"],
    );
  },
);

Deno.test(
  "failover reporting failures are logged and stop subsequent side effects",
  async (t) => {
    for (const failAt of [0, 1, 2]) {
      await t.step(`failure at request ${failAt + 1}`, async () => {
        const responses = [[], null, null];
        const logs: Array<Array<unknown>> = [];
        const original = console.error;
        let requestCount = 0;
        const fixture = executorClient([], 200, {}, undefined, () => {
          requestCount += 1;
          if (requestCount === failAt + 1) {
            return new Response(
              JSON.stringify({ message: "secret-provider-detail" }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }
          return responses.shift();
        });
        console.error = (...args) => {
          logs.push(args);
        };
        try {
          await recordProviderFailover(
            fixture.context.supabase,
            "t1",
            "google/a",
            "openai/b",
            "quota",
          );

          assertEquals(fixture.calls.length, failAt + 1);
          assertEquals(logs.length, 1);
          assertEquals(
            JSON.stringify(logs).includes("secret-provider-detail"),
            false,
          );
        } finally {
          console.error = original;
        }
      });
    }
  },
);
