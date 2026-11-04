import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { declineOfferedDevTask, findOfferedDevTask } from "./dev-task-offer.ts";

const TURN = "2026-10-27T10:00:00.000Z";
const CHAT = "conv-1";

/** A fake supabase client that records each query and answers with `rows`. */
function fakeDb(rows: Record<string, unknown>[]) {
  const calls: Array<{ table: string; ops: Array<[string, unknown[]]> }> = [];
  const db = {
    from(table: string) {
      const call = { table, ops: [] as Array<[string, unknown[]]> };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      const proxy: unknown = new Proxy(chain, {
        get(_target, op: string) {
          if (op === "then") return undefined;
          if (op === "maybeSingle")
            return () =>
              Promise.resolve({ data: rows[0] ?? null, error: null });
          return (...args: unknown[]) => {
            call.ops.push([op, args]);
            return op === "insert"
              ? Promise.resolve({ data: null, error: null })
              : proxy;
          };
        },
      });
      return proxy;
    },
  };
  return { db, calls };
}

Deno.test(
  "the offered task is the newest open one of this chat before this turn",
  async () => {
    const { db, calls } = fakeDb([
      { id: "task-2", title: "t", status: "draft" },
    ]);
    const task = await findOfferedDevTask(db, {
      tenantId: "tenant",
      conversationId: CHAT,
      turnStartedAt: TURN,
    });
    assertStrictEquals(task?.id, "task-2");
    const ops = calls[0].ops;
    assertEquals(
      ops.find(([op]) => op === "in"),
      ["in", ["status", ["draft", "approved"]]],
    );
    assertEquals(
      ops.find(([op]) => op === "lt"),
      ["lt", ["created_at", TURN]],
    );
    assertEquals(
      ops.find(([op]) => op === "order"),
      ["order", ["created_at", { ascending: false }]],
    );
    assertStrictEquals(
      await findOfferedDevTask(db, {
        tenantId: "tenant",
        conversationId: CHAT,
        turnStartedAt: "nope",
      }),
      null,
    );
  },
);

Deno.test("a no cancels only a draft and logs it", async () => {
  const { db, calls } = fakeDb([{ id: "task-1" }]);
  assertStrictEquals(
    await declineOfferedDevTask(db, { tenantId: "tenant", taskId: "task-1" }),
    true,
  );
  const update = calls[0].ops.find(([op]) => op === "update");
  assertStrictEquals(
    (update?.[1][0] as { status: string }).status,
    "cancelled",
  );
  assertEquals(
    calls[0].ops.filter(([op]) => op === "eq").map(([, args]) => args),
    [
      ["id", "task-1"],
      ["tenant_id", "tenant"],
      ["status", "draft"],
    ],
  );
  assertStrictEquals(calls[1].table, "dev_task_events");
  const { db: none } = fakeDb([]);
  assertStrictEquals(
    await declineOfferedDevTask(none, { tenantId: "tenant", taskId: "task-1" }),
    false,
  );
});
