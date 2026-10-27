import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { setClientMoodStatus } from "./client-health-status.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const FOREIGN_TENANT = "33333333-3333-4333-8333-333333333333";

type Row = { id: string; tenant_id: string; mood_status: string | null };

Deno.test("setClientMoodStatus", async (t) => {
  await t.step(
    "sets mood_status on a client in the caller's tenants",
    async () => {
      const { clients, log, run } = moodUpdate([TENANT]);
      await run();
      assertStrictEquals(clients[0].mood_status, "wavering");
      assertEquals(log.find((entry) => entry.op === "in")?.args, [
        "tenant_id",
        [TENANT],
      ]);
    },
  );

  await t.step(
    "a client outside the caller's tenants changes no row and throws",
    async () => {
      const { clients, run } = moodUpdate([FOREIGN_TENANT]);
      await assertRejects(
        run,
        Error,
        "הלקוח לא נמצא בארגון הזה — מצב הבריאות לא עודכן",
      );
      assertStrictEquals(clients[0].mood_status, "happy");
    },
  );

  await t.step("a failed update throws the database error", async () => {
    const dbError = { message: "permission denied" };
    const { run } = moodUpdate([TENANT], dbError);
    const thrown = await assertRejects(run);
    assertStrictEquals(thrown, dbError);
  });
});

/**
 * setClientMoodStatus(CLIENT, "wavering") against one happy client of TENANT,
 * for a caller whose accessible tenants are `accessibleTenantIds`.
 */
function moodUpdate(
  accessibleTenantIds: string[],
  dbError?: { message: string },
) {
  const clients: Row[] = [
    { id: CLIENT, tenant_id: TENANT, mood_status: "happy" },
  ];
  const { supabase, log } = fakeClientsUpdate(clients, dbError);
  const run = () =>
    setClientMoodStatus(supabase, {
      clientId: CLIENT,
      moodStatus: "wavering",
      accessibleTenantIds,
    });
  return { clients, log, run };
}

/**
 * A from("clients").update(...).eq(...).in(...).select(...) stand-in: the
 * filters pick rows, which take the update; awaiting returns them, or
 * `dbError` without touching any row.
 */
function fakeClientsUpdate(rows: Row[], dbError?: { message: string }) {
  const log: Array<{ op: string; args: unknown[] }> = [];
  const filters: Array<(row: Row) => boolean> = [];
  let patch: Partial<Row> = {};
  const chain: Record<string, unknown> = {
    update: (values: Partial<Row>) => {
      log.push({ op: "update", args: [values] });
      patch = values;
      return chain;
    },
    eq: (column: keyof Row, value: unknown) => {
      log.push({ op: "eq", args: [column, value] });
      filters.push((row) => row[column] === value);
      return chain;
    },
    in: (column: keyof Row, values: unknown[]) => {
      log.push({ op: "in", args: [column, values] });
      filters.push((row) => values.includes(row[column]));
      return chain;
    },
    select: (...args: unknown[]) => {
      log.push({ op: "select", args });
      return chain;
    },
    then: (resolve: (result: unknown) => void) => {
      if (dbError) {
        return resolve({ data: null, error: dbError });
      }
      const matched = rows.filter((row) => filters.every((keep) => keep(row)));
      matched.forEach((row) => Object.assign(row, patch));
      return resolve({ data: matched.map(({ id }) => ({ id })), error: null });
    },
  };
  return { supabase: { from: (_table: string) => chain }, log };
}
