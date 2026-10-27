import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { setClientMoodStatus } from "./client-health-status.ts";

const CLIENT_TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const SHARED_TENANT = "33333333-3333-4333-8333-333333333333";
const NO_WRITE = "אין לארגון הזה הרשאת עריכה ללקוח — מצב הבריאות לא עודכן";

type Row = { id: string; tenant_id: string; mood_status: string | null };

/** The client's agency shared with `tenant` at `level`. */
type Share = { tenant: string; level: "read_only" | "read_write" };

type FakeOptions = {
  share?: Share;
  rpcError?: { message: string };
  updateError?: { message: string };
};

Deno.test("setClientMoodStatus", async (t) => {
  await t.step(
    "sets mood_status on the tenant's own client, by client id only",
    async () => {
      const { clients, log, run } = moodUpdate(CLIENT_TENANT);
      await run();
      assertStrictEquals(clients[0].mood_status, "wavering");
      assertEquals(log, [
        {
          op: "rpc",
          args: [
            "tenant_can_write_client",
            { p_tenant: CLIENT_TENANT, p_client: CLIENT },
          ],
        },
        { op: "update", args: [{ mood_status: "wavering" }] },
        { op: "eq", args: ["id", CLIENT] },
        { op: "select", args: ["id"] },
      ]);
    },
  );

  await t.step(
    "sets mood_status for a tenant the agency is shared with read_write",
    async () => {
      const share: Share = { tenant: SHARED_TENANT, level: "read_write" };
      const { clients, run } = moodUpdate(SHARED_TENANT, { share });
      await run();
      assertStrictEquals(clients[0].mood_status, "wavering");
    },
  );

  await t.step(
    "a read_only share sees the client but writes nothing and throws",
    async () => {
      const share: Share = { tenant: SHARED_TENANT, level: "read_only" };
      const { clients, log, run } = moodUpdate(SHARED_TENANT, { share });
      await assertRejects(run, Error, NO_WRITE);
      assertStrictEquals(clients[0].mood_status, "happy");
      assertEquals(
        log.map((entry) => entry.op),
        ["rpc"],
      );
    },
  );

  await t.step("a tenant with no share writes nothing and throws", async () => {
    const { clients, log, run } = moodUpdate(SHARED_TENANT);
    await assertRejects(run, Error, NO_WRITE);
    assertStrictEquals(clients[0].mood_status, "happy");
    assertEquals(
      log.map((entry) => entry.op),
      ["rpc"],
    );
  });

  await t.step(
    "a failed access check throws the database error before any write",
    async () => {
      const dbError = { message: "permission denied for function" };
      const { clients, log, run } = moodUpdate(CLIENT_TENANT, {
        rpcError: dbError,
      });
      const thrown = await assertRejects(run);
      assertStrictEquals(thrown, dbError);
      assertStrictEquals(clients[0].mood_status, "happy");
      assertEquals(
        log.map((entry) => entry.op),
        ["rpc"],
      );
    },
  );

  await t.step("a failed update throws the database error", async () => {
    const dbError = { message: "permission denied" };
    const { run } = moodUpdate(CLIENT_TENANT, { updateError: dbError });
    const thrown = await assertRejects(run);
    assertStrictEquals(thrown, dbError);
  });
});

/**
 * setClientMoodStatus(tenantId, CLIENT, "wavering") against one happy client
 * of CLIENT_TENANT whose agency may be shared with another tenant.
 */
function moodUpdate(tenantId: string, opts: FakeOptions = {}) {
  const clients: Row[] = [
    { id: CLIENT, tenant_id: CLIENT_TENANT, mood_status: "happy" },
  ];
  const { supabase, log } = fakeDb(clients, opts);
  const run = () =>
    setClientMoodStatus(supabase, {
      tenantId,
      clientId: CLIENT,
      moodStatus: "wavering",
    });
  return { clients, log, run };
}

/**
 * Stand-ins for rpc("tenant_can_write_client") — the SQL rule: own client, or
 * a read_write share of its agency — and for
 * from("clients").update(...).eq(...).select(...), whose filters pick the rows
 * that take the update.
 */
function fakeDb(rows: Row[], opts: FakeOptions) {
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
    select: (...args: unknown[]) => {
      log.push({ op: "select", args });
      return chain;
    },
    then: (resolve: (result: unknown) => void) => {
      if (opts.updateError) {
        return resolve({ data: null, error: opts.updateError });
      }
      const matched = rows.filter((row) => filters.every((keep) => keep(row)));
      matched.forEach((row) => Object.assign(row, patch));
      return resolve({ data: matched.map(({ id }) => ({ id })), error: null });
    },
  };
  const rpc = (name: string, args: { p_tenant: string; p_client: string }) => {
    log.push({ op: "rpc", args: [name, args] });
    if (opts.rpcError) {
      return Promise.resolve({ data: null, error: opts.rpcError });
    }
    const client = rows.find((row) => row.id === args.p_client);
    const canWrite =
      client !== undefined &&
      (client.tenant_id === args.p_tenant ||
        (opts.share?.tenant === args.p_tenant &&
          opts.share.level === "read_write"));
    return Promise.resolve({ data: canWrite, error: null });
  };
  return { supabase: { from: (_table: string) => chain, rpc }, log };
}
