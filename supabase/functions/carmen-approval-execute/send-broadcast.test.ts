import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { sendApprovedBroadcast } from "./send-broadcast.ts";
import { executorClient } from "../run-ai-agent/executors/executor-client.test-fixture.ts";

Deno.test("stale broadcast approval performs no enqueue", async () => {
  const f = executorClient([null]);
  let sends = 0;
  await assertRejects(
    () =>
      sendApprovedBroadcast(f.context.supabase, "t1", "bc", async () => {
        sends++;
        return {};
      }),
    Error,
    "broadcast_not_eligible",
  );
  assertEquals(sends, 0);
  assertEquals(f.calls[0].body, { status: "paused" });
  const query = new URL(f.calls[0].url).searchParams;
  assertEquals(query.get("tenant_id"), "eq.t1");
  assertEquals(query.get("status"), "in.(draft,scheduled)");
});

Deno.test(
  "broadcast claim is unsendable until enqueue completes and uses database revision",
  async () => {
    const revision = "2026-11-23T01:00:00.123456+00:00";
    const f = executorClient([
      { id: "bc", updated_at: revision },
      { id: "bc" },
    ]);
    const result = await sendApprovedBroadcast(
      f.context.supabase,
      "t1",
      "bc",
      async () => {
        assertEquals(f.calls.length, 1);
        assertEquals(f.calls[0].body, { status: "paused" });
        return { total: 2 };
      },
    );
    assertEquals(result.recipients, 2);
    assertEquals(
      new URL(f.calls[1].url).searchParams.get("updated_at"),
      "eq." + revision,
    );
  },
);

Deno.test(
  "enqueue failure closes the claim as failed without sending",
  async () => {
    const f = executorClient([{ id: "bc", updated_at: "revision" }, null]);
    await assertRejects(
      () =>
        sendApprovedBroadcast(f.context.supabase, "t1", "bc", async () => {
          throw new Error("enqueue failed");
        }),
      Error,
      "enqueue failed",
    );
    assertEquals(f.calls[1].body, { status: "failed" });
  },
);

Deno.test("concurrent edit after enqueue prevents sending", async () => {
  const f = executorClient([{ id: "bc", updated_at: "revision" }, null, null]);
  await assertRejects(
    () =>
      sendApprovedBroadcast(f.context.supabase, "t1", "bc", async () => ({})),
    Error,
    "broadcast_claim_lost",
  );
  assertEquals(new URL(f.calls[1].url).searchParams.get("status"), "eq.paused");
});
