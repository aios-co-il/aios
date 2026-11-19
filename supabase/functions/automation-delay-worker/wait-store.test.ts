import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { waitStore } from "./wait-store.ts";

type Filter = { op: string; column: string; value: unknown };

/** A wait as the fake table holds it. */
type StoredWait = { id: string; status: string; resume_at: string };

/**
 * A stand-in for automation_delayed_runs with one row: an update changes the
 * row only when every recorded filter matches it, as Postgres would.
 */
function fakeTable(row: StoredWait) {
  const filters: Array<Filter> = [];
  function matches() {
    return filters.every(({ op, column, value }) => {
      const actual = row[column as keyof StoredWait];
      return op === "eq" ? actual === value : actual <= String(value);
    });
  }
  let changes: Partial<StoredWait> = {};
  const query = {
    update(values: Partial<StoredWait>) {
      changes = values;
      return query;
    },
    eq(column: string, value: unknown) {
      filters.push({ op: "eq", column, value });
      return query;
    },
    lte(column: string, value: unknown) {
      filters.push({ op: "lte", column, value });
      return query;
    },
    select: () => query,
    maybeSingle() {
      if (!matches()) {
        return Promise.resolve({ data: null, error: null });
      }
      Object.assign(row, changes);
      return Promise.resolve({ data: { ...row }, error: null });
    },
  };
  // The fake implements only the calls waitStore.claim makes.
  return { from: () => query } as unknown as DbClient;
}

Deno.test("waitStore.claim", async (t) => {
  await t.step("claims a waiting row that is due", async () => {
    const row = {
      id: "wait-1",
      status: "waiting",
      resume_at: new Date(Date.now() - 60_000).toISOString(),
    };

    const claimed = await waitStore(fakeTable(row)).claim("wait-1");

    assertEquals(claimed?.id, "wait-1");
    assertStrictEquals(row.status, "resuming");
  });

  await t.step(
    "leaves a wait restarted into the future after it was listed",
    async () => {
      const row = {
        id: "wait-1",
        status: "waiting",
        resume_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      };

      const claimed = await waitStore(fakeTable(row)).claim("wait-1");

      assertStrictEquals(claimed, null);
      assertStrictEquals(row.status, "waiting");
    },
  );

  await t.step("leaves a wait another worker already claimed", async () => {
    const row = {
      id: "wait-1",
      status: "resuming",
      resume_at: new Date(Date.now() - 60_000).toISOString(),
    };

    assertStrictEquals(await waitStore(fakeTable(row)).claim("wait-1"), null);
  });
});
