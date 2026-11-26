import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { DbClient } from "../supabase-clients.ts";
import { readRunStopped, runStopCheck } from "./run-stop.ts";

const RUN = "11111111-2222-3333-4444-555555555555";

/** A db whose cancellations table holds these rows and counts its reads; `failing` makes every read an error. */
function fakeDb(
  rows: Array<{ run_id: string; user_id: string }>,
  failing = false,
) {
  let reads = 0;
  // The fake implements only the calls run-stop.ts makes, so it is not the full client type.
  const db = { from } as unknown as Pick<DbClient, "from">;
  return { db, reads: () => reads };

  /** The cancellations query. */
  function from() {
    const filters: Record<string, string> = {};
    const chain = {
      select: () => chain,
      eq: (column: string, value: string) => ((filters[column] = value), chain),
      maybeSingle: () => {
        reads += 1;
        if (failing) {
          return Promise.resolve({ data: null, error: { message: "boom" } });
        }
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
    const stopped = runStopCheck(fake.db, RUN, "u1");
    assertEquals(await stopped(), true);
    assertEquals(await stopped(), true);
    assertEquals(fake.reads(), 1);
  },
);

Deno.test("a stop by someone else, or no stop, does not", async () => {
  const fake = fakeDb([{ run_id: RUN, user_id: "u2" }]);
  assertEquals(await runStopCheck(fake.db, RUN, "u1")(), false);
});

Deno.test(
  "a run without a valid id or user is never stopped and never read",
  async () => {
    const fake = fakeDb([]);
    assertEquals(await runStopCheck(fake.db, "nope", "u1")(), false);
    assertEquals(await runStopCheck(fake.db, RUN, null)(), false);
    assertEquals(fake.reads(), 0);
  },
);

Deno.test("a failed read", async (t) => {
  await t.step(
    "reads as not stopped for a turn in progress, and is read again",
    async () => {
      const fake = fakeDb([{ run_id: RUN, user_id: "u1" }], true);
      const stopped = runStopCheck(fake.db, RUN, "u1");

      assertEquals(await stopped(), false);
      assertEquals(await stopped(), false);
      assertEquals(fake.reads(), 2);
    },
  );

  await t.step("throws for a caller that must know", async () => {
    const fake = fakeDb([], true);

    await assertRejects(
      () => readRunStopped(fake.db, RUN, "u1"),
      Error,
      "boom",
    );
  });
});

Deno.test("readRunStopped answers for the run's own user only", async () => {
  const fake = fakeDb([{ run_id: RUN, user_id: "u1" }]);

  assertEquals(await readRunStopped(fake.db, RUN, "u1"), true);
  assertEquals(await readRunStopped(fake.db, RUN, "u2"), false);
});
