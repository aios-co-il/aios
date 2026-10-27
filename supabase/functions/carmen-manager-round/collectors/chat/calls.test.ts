import { assertEquals } from "jsr:@std/assert@1";
import { NOW } from "../../tests/chat-fixtures.ts";
import { TENANT } from "../../tests/fake-world.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import { loadCompletedCalls } from "./calls.ts";

const AT = "2026-10-27T10:00:00Z";

Deno.test("loadCompletedCalls", async (t) => {
  await t.step(
    "completed calls of the tenants, matched to the clients here",
    async () => {
      const { db, calls } = recordingClient(() => [
        { client_id: "c1", created_at: AT },
        { client_id: "c9", created_at: AT },
        { client_id: null, created_at: AT },
      ]);
      assertEquals(await loadCompletedCalls(db, [TENANT], ["c1", "c2"], NOW), [
        { client_id: "c1", created_at: AT },
      ]);
      const query = calls[0].query;
      assertEquals(
        [
          calls[0].path,
          query.get("tenant_id"),
          query.get("status"),
          query.get("client_id"),
          query.get("or"),
          query.get("created_at"),
        ],
        [
          "call_logs",
          `in.(${TENANT})`,
          "eq.completed",
          "not.is.null",
          "(duration.is.null,duration.gt.0)",
          `gte.${NOW.toISOString()}`,
        ],
      );
    },
  );

  await t.step("pages past the API's row cap", async () => {
    const page = Array.from({ length: 1_000 }, () => ({
      client_id: "c1",
      created_at: AT,
    }));
    const { db, calls } = recordingClient(({ query }) =>
      query.get("offset") === "1000" ? page.slice(0, 3) : page,
    );
    const found = await loadCompletedCalls(db, [TENANT], ["c1"], NOW);
    assertEquals([found.length, calls.length], [1_003, 2]);
  });

  await t.step("no clients, no query", async () => {
    const { db, calls } = recordingClient();
    assertEquals(await loadCompletedCalls(db, [TENANT], [], NOW), []);
    assertEquals(calls.length, 0);
  });
});
