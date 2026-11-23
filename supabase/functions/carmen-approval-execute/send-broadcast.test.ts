import { writeEnqueueStats } from "../broadcast-enqueue/stats.ts";
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  sendApprovedBroadcast,
  invokeBroadcastEnqueue,
  BroadcastEnqueueError,
} from "./send-broadcast.ts";
import { executorClient } from "../run-ai-agent/executors/executor-client.test-fixture.ts";

Deno.test("stale broadcast approval performs no enqueue", async () => {
  const f = executorClient([null]);
  let sends = 0;
  await assertRejects(
    () =>
      sendApprovedBroadcast(f.context.supabase, "t1", "bc", async () => {
        sends++;
        return { revision: "unused" };
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
  "enqueue stats advance the claim revision; sending waits for completion",
  async () => {
    const before = "2026-11-23T01:00:00.123456+00:00";
    const after = "2026-11-23T01:00:01.654321+00:00";
    const f = executorClient([
      { id: "bc", updated_at: before },
      { updated_at: after },
      { id: "bc" },
    ]);
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const pending = sendApprovedBroadcast(
      f.context.supabase,
      "t1",
      "bc",
      async (revision) => {
        started.resolve();
        await release.promise;
        return {
          total: 2,
          revision: await writeEnqueueStats(
            f.context.supabase,
            "t1",
            "bc",
            2,
            revision,
          ),
        };
      },
    );
    await started.promise;
    assertEquals(f.calls.length, 1);
    assertEquals(f.calls[0].body, { status: "paused" });
    release.resolve();
    assertEquals((await pending).recipients, 2);
    assertEquals(
      new URL(f.calls[1].url).searchParams.get("updated_at"),
      "eq." + before,
    );
    assertEquals(
      new URL(f.calls[2].url).searchParams.get("updated_at"),
      "eq." + after,
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
      sendApprovedBroadcast(f.context.supabase, "t1", "bc", async () => ({
        revision: "after-enqueue",
      })),
    Error,
    "broadcast_claim_lost",
  );
  assertEquals(new URL(f.calls[1].url).searchParams.get("status"), "eq.paused");
});

Deno.test(
  "enqueue HTTP details survive after failed-claim cleanup",
  async () => {
    const f = executorClient([
      { id: "bc", updated_at: "revision" },
      new Response(JSON.stringify({ error: "missing_groupIds" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
      null,
    ]);
    const error = await assertRejects(
      () =>
        sendApprovedBroadcast(f.context.supabase, "t1", "bc", (revision) =>
          invokeBroadcastEnqueue(f.context.supabase, "bc", revision),
        ),
      BroadcastEnqueueError,
    );
    assertEquals(error.detail, { error: "missing_groupIds" });
    assertEquals(f.calls[1].body, {
      broadcastId: "bc",
      dryRun: false,
      claimRevision: "revision",
    });
    assertEquals(f.calls[2].body, { status: "failed" });
  },
);

Deno.test(
  "concurrent edit before stats cannot be overwritten by enqueue",
  async () => {
    const f = executorClient([
      { id: "bc", updated_at: "revision" },
      null,
      null,
    ]);
    await assertRejects(
      () =>
        sendApprovedBroadcast(
          f.context.supabase,
          "t1",
          "bc",
          async (revision) => ({
            total: 2,
            revision: await writeEnqueueStats(
              f.context.supabase,
              "t1",
              "bc",
              2,
              revision,
            ),
          }),
        ),
      Error,
      "broadcast_claim_lost",
    );
    assertEquals(f.calls.length, 3);
    for (const call of f.calls.slice(1)) {
      const url = new URL(call.url);
      assertEquals(url.searchParams.get("tenant_id"), "eq.t1");
      assertEquals(url.searchParams.get("updated_at"), "eq.revision");
    }
  },
);
