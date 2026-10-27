import { assertEquals } from "jsr:@std/assert@1";
import { NOW } from "../../tests/chat-fixtures.ts";
import { TENANT } from "../../tests/fake-world.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import { loadCompletedCalls } from "./calls.ts";

Deno.test("loadCompletedCalls", async (t) => {
  await t.step("completed calls of the tenants to these clients", async () => {
    const { db, calls } = recordingClient(() => [
      { client_id: "c1", created_at: "2026-10-27T10:00:00Z" },
      { client_id: null, created_at: "2026-10-27T10:00:00Z" },
    ]);
    assertEquals(await loadCompletedCalls(db, [TENANT], ["c1", "c2"], NOW), [
      { client_id: "c1", created_at: "2026-10-27T10:00:00Z" },
    ]);
    const query = calls[0].query;
    assertEquals(
      [
        calls[0].path,
        query.get("tenant_id"),
        query.get("status"),
        query.get("client_id"),
        query.get("created_at"),
      ],
      [
        "call_logs",
        `in.(${TENANT})`,
        "eq.completed",
        "in.(c1,c2)",
        `gte.${NOW.toISOString()}`,
      ],
    );
  });

  await t.step("no clients, no query", async () => {
    const { db, calls } = recordingClient();
    assertEquals(await loadCompletedCalls(db, [TENANT], [], NOW), []);
    assertEquals(calls.length, 0);
  });
});
