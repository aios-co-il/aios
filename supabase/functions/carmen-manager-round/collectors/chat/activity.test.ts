import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { NOW, row } from "../../tests/chat-fixtures.ts";
import { TENANT } from "../../tests/fake-world.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import { loadThreadActivity, loadUnlinkedGroups } from "./activity.ts";

const query = {
  tenantId: TENANT,
  connectionIds: ["owner"],
  since: NOW,
  clientIds: null,
};

Deno.test("loadThreadActivity", async (t) => {
  await t.step("names the tenant, the lines and the provider", async () => {
    const { db, calls } = recordingClient(() => [row()]);
    assertEquals((await loadThreadActivity(db, query)).length, 1);
    assertEquals(calls[0].path, "rpc/get_client_thread_activity");
    assertEquals(calls[0].body, {
      p_tenant_id: TENANT,
      p_connection_user_ids: ["owner"],
      p_since: NOW.toISOString(),
      p_provider: "green_api",
      p_per_thread: 15,
    });
  });

  await t.step("pages past the API's row cap", async () => {
    const page = Array.from({ length: 1_000 }, () => row());
    const { db, calls } = recordingClient(({ query: params }) =>
      params.get("offset") === "1000" ? [row()] : page,
    );
    assertEquals((await loadThreadActivity(db, query)).length, 1_001);
    assertEquals(
      calls.map((c) => [c.query.get("offset"), c.query.get("limit")]),
      [
        ["0", "1000"],
        ["1000", "1000"],
      ],
    );
  });

  await t.step("a failed read throws", async () => {
    const { db } = recordingClient(() => ({ message: "boom" }), {
      status: 500,
    });
    await assertRejects(() => loadThreadActivity(db, query), Error, "boom");
  });
});

Deno.test("loadUnlinkedGroups", async (t) => {
  await t.step("names the tenant, the lines and the provider", async () => {
    const { db, calls } = recordingClient(() => []);
    await loadUnlinkedGroups(db, query);
    assertEquals(calls[0].path, "rpc/get_unlinked_client_groups");
    assertEquals(calls[0].body, {
      p_tenant_id: TENANT,
      p_connection_user_ids: ["owner"],
      p_since: NOW.toISOString(),
      p_provider: "green_api",
    });
  });
});
