import { assertEquals } from "jsr:@std/assert@1";
import { runStopCheck, stoppedReply } from "./run-cancel.ts";

const RUN = "11111111-2222-3333-4444-555555555555";

/** A db whose cancellations table holds these rows and counts its reads. */
function fakeDb(rows: Array<{ run_id: string; user_id: string }>) {
  let reads = 0;
  const db = { from };
  return { db, reads: () => reads };

  /** The cancellations query. */
  function from() {
    const filters: Record<string, string> = {};
    const chain = {
      select: () => chain,
      eq: (column: string, value: string) => ((filters[column] = value), chain),
      maybeSingle: () => {
        reads += 1;
        const row = rows.find(
          (r) => r.run_id === filters.run_id && r.user_id === filters.user_id,
        );
        return Promise.resolve({ data: row ?? null, error: null });
      },
    };
    return chain;
  }
}

Deno.test(
  "a stop by the run's own user stops it, and is read once",
  async () => {
    const fake = fakeDb([{ run_id: RUN, user_id: "u1" }]);
    const stopped = runStopCheck(fake.db as never, RUN, "u1");
    assertEquals(await stopped(), true);
    assertEquals(await stopped(), true);
    assertEquals(fake.reads(), 1);
  },
);

Deno.test("a stop by someone else, or no stop, does not", async () => {
  const fake = fakeDb([{ run_id: RUN, user_id: "u2" }]);
  assertEquals(await runStopCheck(fake.db as never, RUN, "u1")(), false);
});

Deno.test(
  "a run without a valid id or user is never stopped and never read",
  async () => {
    const fake = fakeDb([]);
    assertEquals(await runStopCheck(fake.db as never, "nope", "u1")(), false);
    assertEquals(await runStopCheck(fake.db as never, RUN, null)(), false);
    assertEquals(fake.reads(), 0);
  },
);

Deno.test("the stop reply names what already ran", () => {
  assertEquals(
    stoppedReply(["list_leads", "list_leads", "create_task"]),
    "⏹️ עצרתי לפי בקשתך. לפני העצירה כבר הרצתי: list_leads, create_task.",
  );
  assertEquals(stoppedReply([]), "⏹️ עצרתי לפי בקשתך. לא בוצעה שום פעולה.");
});
