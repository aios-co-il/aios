/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import {
  heldPeerNotification,
  holdTaskNotificationForShabbat,
  releaseHeldTaskNotifications,
  taskNotificationsHeldUntil,
  type HoldTenantDecision,
} from "./task-notification-hold.ts";

/**
 * task_notification_holds in memory, with the open-key unique index, plus the
 * tasks/clients rows the tenant check reads.
 */
function fakeHolds(
  tables: { tasks?: any[]; clients?: any[] } = {
    tasks: [{ id: "task-1", tenant_id: "t1", client_id: null }],
  },
) {
  const rows: any[] = [];
  let nextId = 1;
  const from = (table: string) => {
    const source =
      table === "task_notification_holds"
        ? rows
        : (tables[table as "tasks" | "clients"] ?? []);
    const filters: Array<(row: any) => boolean> = [];
    let patch: any = null;
    let limit = Infinity;
    const matching = () => source.filter((row) => filters.every((f) => f(row)));
    const builder: any = {
      select: () => builder,
      is: (col: string, val: unknown) => (
        filters.push((row) => (row[col] ?? null) === val),
        builder
      ),
      eq: (col: string, val: unknown) => (
        filters.push((row) => row[col] === val),
        builder
      ),
      lte: (col: string, val: string) => (
        filters.push((row) => row[col] <= val),
        builder
      ),
      order: () => builder,
      limit: (n: number) => ((limit = n), builder),
      update: (values: any) => ((patch = values), builder),
      insert: async (row: any) => {
        const clash = rows.some(
          (other) =>
            other.released_at == null &&
            other.task_id === row.task_id &&
            other.notification_type === row.notification_type &&
            other.hold_key === row.hold_key,
        );
        if (clash) return { error: { code: "23505", message: "duplicate" } };
        rows.push({ id: `h${nextId++}`, released_at: null, ...row });
        return { error: null };
      },
      maybeSingle: async () => {
        const hit = matching()[0] || null;
        if (hit && patch) Object.assign(hit, patch);
        return { data: hit, error: null };
      },
      then: (resolve: (value: unknown) => void) => {
        const hits = matching().slice(0, limit);
        if (patch) for (const hit of hits) Object.assign(hit, patch);
        resolve({ data: hits, error: null });
      },
    };
    return builder;
  };
  return { from, rows };
}

const SATURDAY = new Date("2026-10-31T09:00:00Z"); // 11:00 Israel
const SUNDAY_0829 = new Date("2026-11-01T06:29:00Z");
const SUNDAY_0830 = new Date("2026-11-01T06:30:00Z");

type HoldOptions = {
  authorizeTenant: (tenantId: string | null) => Promise<HoldTenantDecision>;
};

/** The service role, or a caller who belongs to tenants `memberOf`. */
const authorizedFor =
  (...memberOf: string[]): HoldOptions["authorizeTenant"] =>
  async (tenantId) =>
    memberOf.includes("service") ||
    (tenantId !== null && memberOf.includes(tenantId))
      ? { allowed: true }
      : { allowed: false, status: 403, error: "Not a member" };
const asService: HoldOptions = { authorizeTenant: authorizedFor("service") };
const hold = (
  supabase: any,
  body: any,
  now: Date,
  options: HoldOptions = asService,
) => holdTaskNotificationForShabbat(supabase, body, { ...options, now });

const update = {
  trigger_type: "task_update_added",
  tenant_id: "t1",
  data: {
    task_id: "task-1",
    user_id: "u1",
    update_content: "הלקוח אישר את הקריאייטיב",
    updater_name: "דוד",
    unexpected: "dropped",
  },
};

test("outside the window nothing is held", async () => {
  const supabase = fakeHolds();
  assert.equal(await hold(supabase, update, SUNDAY_0830), null);
  assert.equal(supabase.rows.length, 0);
});

test("a worker-driven notification on Saturday is refused, not queued", async () => {
  const supabase = fakeHolds();
  const held = await hold(
    supabase,
    { trigger_type: "task_assigned", data: { task_id: "task-1" } },
    SATURDAY,
  );
  assert.equal(held?.status, 202);
  const body = held?.body as any;
  assert.equal(body.sent, false);
  assert.equal(body.handled, true);
  assert.equal(body.hold_until, SUNDAY_0830.toISOString());
  assert.equal(body.queued, undefined);
  assert.equal(supabase.rows.length, 0); // the worker marker carries it
});

test("a peer notification on Saturday is queued once and sent once on Sunday 08:30", async () => {
  const supabase = fakeHolds();
  const first = await hold(supabase, update, SATURDAY);
  const again = await hold(supabase, update, SATURDAY);
  assert.equal(first?.body.queued, true);
  assert.equal(again?.body.queued, true);
  assert.equal(supabase.rows.length, 1);
  assert.deepEqual(supabase.rows[0].request_body.data, {
    task_id: "task-1",
    user_id: "u1",
    updater_name: "דוד",
    update_content: "הלקוח אישר את הקריאייטיב",
  });

  const delivered: unknown[] = [];
  const deliver = async (body: unknown) => (
    delivered.push(body),
    { sent: true }
  );
  assert.deepEqual(
    await releaseHeldTaskNotifications(supabase, deliver, SATURDAY),
    [],
  );
  assert.deepEqual(
    await releaseHeldTaskNotifications(supabase, deliver, SUNDAY_0829),
    [],
  );
  const released = await releaseHeldTaskNotifications(
    supabase,
    deliver,
    SUNDAY_0830,
  );
  assert.equal(released.length, 1);
  assert.equal(released[0].released, true);
  assert.equal(delivered.length, 1);
  assert.equal((delivered[0] as any).trigger_type, "task_update_added");

  const nextMinute = new Date(SUNDAY_0830.getTime() + 60_000);
  assert.deepEqual(
    await releaseHeldTaskNotifications(supabase, deliver, nextMinute),
    [],
  );
  assert.equal(delivered.length, 1);
});

test("a hold the worker never released within 24h expires unsent", async () => {
  const supabase = fakeHolds();
  await hold(supabase, update, SATURDAY);
  const delivered: unknown[] = [];
  const released = await releaseHeldTaskNotifications(
    supabase,
    async (body) => delivered.push(body),
    new Date("2026-11-02T07:00:00Z"), // Monday 09:00
  );
  assert.equal(released[0].expired, true);
  assert.equal(delivered.length, 0);
});

test("collaborator holds are keyed per added campaigner", () => {
  const a = heldPeerNotification({
    trigger_type: "task_collaborator_added",
    data: { task_id: "task-1", notify_campaigner_id: "c-a" },
  });
  const b = heldPeerNotification({
    trigger_type: "task_collaborator_added",
    data: { task_id: "task-1", notify_campaigner_id: "c-b" },
  });
  assert.notEqual(a?.hold_key, b?.hold_key);
  assert.equal(
    heldPeerNotification({ trigger_type: "task_assigned", data: {} }),
    null,
  );
});

test("the task window is Saturday plus Sunday until 08:30", () => {
  assert.equal(
    taskNotificationsHeldUntil(SATURDAY)?.toISOString(),
    SUNDAY_0830.toISOString(),
  );
  assert.equal(taskNotificationsHeldUntil(SUNDAY_0830), null);
});

// ── The hold queue must not widen trigger-automation's tenant check ─────────

test("a caller who does not belong to the body's tenant is refused and nothing is queued", async () => {
  const supabase = fakeHolds();
  const anon: HoldOptions = {
    authorizeTenant: async () => ({
      allowed: false,
      status: 401,
      error: "Unauthorized",
    }),
  };
  const anonymous = await hold(supabase, update, SATURDAY, anon);
  assert.equal(anonymous?.status, 401);
  assert.equal(anonymous?.body.queued, false);

  const otherTenant = await hold(supabase, update, SATURDAY, {
    authorizeTenant: authorizedFor("t2"),
  });
  assert.equal(otherTenant?.status, 403);
  assert.equal(supabase.rows.length, 0);
});

test("a body tenant the task does not belong to is refused, even for its own member", async () => {
  // The attacker belongs to t2 and names t2, but the task is t1's (and the
  // reverse: their own task, someone else's tenant). Neither is queued.
  const supabase = fakeHolds({
    tasks: [
      { id: "task-1", tenant_id: "t1", client_id: null },
      { id: "task-own", tenant_id: "t2", client_id: null },
    ],
  });
  const foreignTask = await hold(
    supabase,
    { ...update, tenant_id: "t2" },
    SATURDAY,
    { authorizeTenant: authorizedFor("t2") },
  );
  assert.equal(foreignTask?.status, 403);
  const foreignTenant = await hold(
    supabase,
    {
      ...update,
      tenant_id: "t1",
      data: { ...update.data, task_id: "task-own" },
    },
    SATURDAY,
    { authorizeTenant: authorizedFor("t2") },
  );
  assert.equal(foreignTenant?.status, 403);
  assert.equal(supabase.rows.length, 0);

  const delivered: any[] = [];
  await releaseHeldTaskNotifications(
    supabase,
    async (body) => delivered.push(body),
    SUNDAY_0830,
  );
  assert.equal(delivered.length, 0);
});

test("a held peer notification is replayed only with the task's own tenant", async () => {
  const supabase = fakeHolds({
    tasks: [{ id: "task-1", tenant_id: "t-board", client_id: "client-1" }],
    clients: [{ id: "client-1", tenant_id: "t-client" }],
  });
  // A member of the task's board tenant, as the app sends it.
  const member = await hold(
    supabase,
    { ...update, tenant_id: "t-board" },
    SATURDAY,
    { authorizeTenant: authorizedFor("t-board") },
  );
  assert.equal(member?.body.queued, true);
  // An internal service caller without tenant_id (run-ai-agent): the client's
  // tenant, the same one Carmen routes by.
  const service = await hold(
    supabase,
    {
      trigger_type: "task_collaborator_added",
      data: { task_id: "task-1", notify_campaigner_id: "c-a" },
    },
    SATURDAY,
  );
  assert.equal(service?.body.queued, true);

  const delivered: any[] = [];
  await releaseHeldTaskNotifications(
    supabase,
    async (body) => delivered.push(body),
    SUNDAY_0830,
  );
  assert.deepEqual(delivered.map((body) => body.tenant_id).sort(), [
    "t-board",
    "t-client",
  ]);
});

test("a non-service caller without tenant_id gets the generic path's answer", async () => {
  const supabase = fakeHolds();
  const seen: Array<string | null> = [];
  const result = await hold(
    supabase,
    { ...update, tenant_id: undefined },
    SATURDAY,
    {
      authorizeTenant: async (tenantId) => {
        seen.push(tenantId);
        return { allowed: false, status: 400, error: "missing_tenant_id" };
      },
    },
  );
  assert.deepEqual(seen, [null]);
  assert.equal(result?.status, 400);
  assert.equal(supabase.rows.length, 0);
});

test("a peer notification for a task that does not exist is not queued", async () => {
  const supabase = fakeHolds({ tasks: [] });
  const result = await hold(supabase, update, SATURDAY);
  assert.equal(result?.status, 202);
  assert.equal(result?.body.queued, false);
  assert.equal(supabase.rows.length, 0);
});
