import { assertEquals } from "jsr:@std/assert@1";
import { fakeDb } from "./fake-db.ts";
import { initiateCall } from "./initiate.ts";
import { MAX_CALLS_PER_CALLER } from "./limits.ts";

/** Starts a call from an unknown number that already called `earlier` times this hour. */
async function initiate(earlier: number) {
  const { db, writes } = fakeDb({
    carmen_phone_lines: [{ id: "line1", tenant_id: "t1" }],
    carmen_phone_calls: Array.from({ length: earlier }, (_, i) => ({
      id: `call-${i}`,
    })),
    tenants: [{ name: "הסוכנות" }],
    carmen_caller_policies: [],
  });
  const reply = await initiateCall(db, {
    caller_id: "+972529998888",
    called_number: "035550101",
    conversation_id: "conv_1",
  });
  const insert = writes.find(
    (w) => w.table === "carmen_phone_calls" && w.op === "insert",
  );
  return { reply, row: insert?.values as Record<string, unknown> };
}

Deno.test("the hourly call limit per caller", async (t) => {
  await t.step("a 5th call within the hour is answered normally", async () => {
    const { row } = await initiate(MAX_CALLS_PER_CALLER - 1);
    assertEquals(row.rate_limited, false);
  });

  await t.step(
    "a 6th call within the hour is answered but marked to take no messages",
    async () => {
      const { reply, row } = await initiate(MAX_CALLS_PER_CALLER);
      assertEquals(reply.dynamic_variables.call_id, "call-0");
      assertEquals(row.rate_limited, true);
    },
  );
});
