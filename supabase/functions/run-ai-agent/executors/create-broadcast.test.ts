import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeCreateBroadcast } from "./create-broadcast.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "broadcast creation preserves filters but cannot override audience or skip scheduling approval",
  async () => {
    const f = executorClient([
      { id: "line", integration_type: "green_api" },
      { id: "bc", name: "draft", status: "draft" },
    ]);
    const result = await executeCreateBroadcast(
      {
        name: "draft",
        body_text: "hello",
        audience_source: "clients",
        audience_filter: { source: "leads", limit: 7 },
        scheduled_at: "2099-01-01T00:00:00Z",
      },
      f.context,
    );
    assertEquals(f.calls[1].body, {
      tenant_id: "t1",
      created_by: null,
      name: "draft",
      channel: "whatsapp",
      provider: "green_api",
      integration_id: "line",
      body_text: "hello",
      audience_filter: { source: "clients", limit: 7 },
      status: "draft",
      scheduled_at: "2099-01-01T00:00:00Z",
    });
    assertEquals(result.pending_approval, false);
    assertEquals(result.approval_id, null);
  },
);

Deno.test(
  "foreign or missing broadcast integration never reaches insert",
  async () => {
    const f = executorClient([null]);
    await assertRejects(() =>
      executeCreateBroadcast(
        {
          name: "x",
          body_text: "hello",
          audience_source: "clients",
          integration_id: "foreign",
        },
        f.context,
      ),
    );
    assertEquals(f.calls.length, 1);
    assertEquals(
      new URL(f.calls[0].url).searchParams.get("tenant_id"),
      "eq.t1",
    );
  },
);
