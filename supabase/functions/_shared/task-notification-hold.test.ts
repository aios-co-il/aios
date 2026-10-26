/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";
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
  tables: { tasks?: any[]; clients?: any[]; agency_tenant_access?: any[] } = {
    tasks: [{ id: "task-1", tenant_id: "t1", client_id: null }],
  },
) {
  const rows: any[] = [];
  let nextId = 1;
  const from = (table: string) => {
    const source =
      table === "task_notification_holds"
        ? rows
        : (tables[table as "tasks" | "clients" | "agency_tenant_access"] ?? []);
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

Deno.test("outside the window nothing is held", async () => {
  const supabase = fakeHolds();
  assertStrictEquals(await hold(supabase, update, SUNDAY_0830), null);
  assertStrictEquals(supabase.rows.length, 0);
});

Deno.test(
  "a worker-driven notification on Saturday is refused, not queued",
  async () => {
    const supabase = fakeHolds();
    const held = await hold(
      supabase,
      { trigger_type: "task_assigned", data: { task_id: "task-1" } },
      SATURDAY,
    );
    assertStrictEquals(held?.status, 202);
    const body = held?.body as any;
    assertStrictEquals(body.sent, false);
    assertStrictEquals(body.handled, true);
    assertStrictEquals(body.hold_until, SUNDAY_0830.toISOString());
    assertStrictEquals(body.queued, undefined);
    assertStrictEquals(supabase.rows.length, 0); // the worker marker carries it
  },
);

Deno.test(
  "a peer notification on Saturday is queued once and sent once on Sunday 08:30",
  async () => {
    const supabase = fakeHolds();
    const first = await hold(supabase, update, SATURDAY);
    const again = await hold(supabase, update, SATURDAY);
    assertStrictEquals(first?.body.queued, true);
    assertStrictEquals(again?.body.queued, true);
    assertStrictEquals(supabase.rows.length, 1);
    assertEquals(supabase.rows[0].request_body.data, {
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
    assertEquals(
      await releaseHeldTaskNotifications(supabase, deliver, SATURDAY),
      [],
    );
    assertEquals(
      await releaseHeldTaskNotifications(supabase, deliver, SUNDAY_0829),
      [],
    );
    const released = await releaseHeldTaskNotifications(
      supabase,
      deliver,
      SUNDAY_0830,
    );
    assertStrictEquals(released.length, 1);
    assertStrictEquals(released[0].released, true);
    assertStrictEquals(delivered.length, 1);
    assertStrictEquals((delivered[0] as any).trigger_type, "task_update_added");

    const nextMinute = new Date(SUNDAY_0830.getTime() + 60_000);
    assertEquals(
      await releaseHeldTaskNotifications(supabase, deliver, nextMinute),
      [],
    );
    assertStrictEquals(delivered.length, 1);
  },
);

Deno.test(
  "a hold the worker never released within 24h expires unsent",
  async () => {
    const supabase = fakeHolds();
    await hold(supabase, update, SATURDAY);
    const delivered: unknown[] = [];
    const released = await releaseHeldTaskNotifications(
      supabase,
      async (body) => delivered.push(body),
      new Date("2026-11-02T07:00:00Z"), // Monday 09:00
    );
    assertStrictEquals(released[0].expired, true);
    assertStrictEquals(delivered.length, 0);
  },
);

Deno.test("collaborator holds are keyed per added campaigner", () => {
  const a = heldPeerNotification({
    trigger_type: "task_collaborator_added",
    data: { task_id: "task-1", notify_campaigner_id: "c-a" },
  });
  const b = heldPeerNotification({
    trigger_type: "task_collaborator_added",
    data: { task_id: "task-1", notify_campaigner_id: "c-b" },
  });
  assertNotStrictEquals(a?.hold_key, b?.hold_key);
  assertStrictEquals(
    heldPeerNotification({ trigger_type: "task_assigned", data: {} }),
    null,
  );
});

Deno.test("the task window is Saturday plus Sunday until 08:30", () => {
  assertStrictEquals(
    taskNotificationsHeldUntil(SATURDAY)?.toISOString(),
    SUNDAY_0830.toISOString(),
  );
  assertStrictEquals(taskNotificationsHeldUntil(SUNDAY_0830), null);
});

// ── The hold queue must not widen trigger-automation's tenant check ─────────

Deno.test(
  "a caller who does not belong to the body's tenant is refused and nothing is queued",
  async () => {
    const supabase = fakeHolds();
    const anon: HoldOptions = {
      authorizeTenant: async () => ({
        allowed: false,
        status: 401,
        error: "Unauthorized",
      }),
    };
    const anonymous = await hold(supabase, update, SATURDAY, anon);
    assertStrictEquals(anonymous?.status, 401);
    assertStrictEquals(anonymous?.body.queued, false);

    const otherTenant = await hold(supabase, update, SATURDAY, {
      authorizeTenant: authorizedFor("t2"),
    });
    assertStrictEquals(otherTenant?.status, 403);
    assertStrictEquals(supabase.rows.length, 0);
  },
);

Deno.test(
  "a body tenant the task does not belong to is refused, even for its own member",
  async () => {
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
    assertStrictEquals(foreignTask?.status, 403);
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
    assertStrictEquals(foreignTenant?.status, 403);
    assertStrictEquals(supabase.rows.length, 0);

    const delivered: any[] = [];
    await releaseHeldTaskNotifications(
      supabase,
      async (body) => delivered.push(body),
      SUNDAY_0830,
    );
    assertStrictEquals(delivered.length, 0);
  },
);

Deno.test(
  "a held peer notification is replayed only with the task's own tenant",
  async () => {
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
    assertStrictEquals(member?.body.queued, true);
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
    assertStrictEquals(service?.body.queued, true);

    const delivered: any[] = [];
    await releaseHeldTaskNotifications(
      supabase,
      async (body) => delivered.push(body),
      SUNDAY_0830,
    );
    assertEquals(delivered.map((body) => body.tenant_id).sort(), [
      "t-board",
      "t-client",
    ]);
  },
);

Deno.test(
  "a non-service caller without tenant_id gets the generic path's answer",
  async () => {
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
    assertEquals(seen, [null]);
    assertStrictEquals(result?.status, 400);
    assertStrictEquals(supabase.rows.length, 0);
  },
);

Deno.test(
  "a peer notification for a task that does not exist is not queued",
  async () => {
    const supabase = fakeHolds({ tasks: [] });
    const result = await hold(supabase, update, SATURDAY);
    assertStrictEquals(result?.status, 202);
    assertStrictEquals(result?.body.queued, false);
    assertStrictEquals(supabase.rows.length, 0);
  },
);

Deno.test(
  "a tenant sharing the task's agency is held and delivered on Sunday, not dropped",
  async () => {
    // Tenant t-shared sees agency ag-1's tasks through agency_tenant_access, the
    // grant behind the shared-agency task policy; the app sends its own tenant.
    const supabase = fakeHolds({
      tasks: [
        { id: "task-1", tenant_id: "t1", client_id: null, agency_id: "ag-1" },
      ],
      agency_tenant_access: [
        { id: "ata-1", accessing_tenant_id: "t-shared", agency_id: "ag-1" },
      ],
    });
    const held = await hold(
      supabase,
      { ...update, tenant_id: "t-shared" },
      SATURDAY,
      { authorizeTenant: authorizedFor("t-shared") },
    );
    assertStrictEquals(held?.status, 202);
    assertStrictEquals(supabase.rows.length, 1);
    assertStrictEquals(supabase.rows[0].request_body.tenant_id, "t-shared");

    const delivered: any[] = [];
    await releaseHeldTaskNotifications(
      supabase,
      async (body) => delivered.push(body),
      SUNDAY_0830,
    );
    assertStrictEquals(delivered.length, 1);
    assertStrictEquals(delivered[0].tenant_id, "t-shared");
  },
);

Deno.test(
  "a tenant with access to another agency is still refused",
  async () => {
    const supabase = fakeHolds({
      tasks: [
        { id: "task-1", tenant_id: "t1", client_id: null, agency_id: "ag-1" },
      ],
      agency_tenant_access: [
        { id: "ata-1", accessing_tenant_id: "t2", agency_id: "ag-other" },
      ],
    });
    const refused = await hold(
      supabase,
      { ...update, tenant_id: "t2" },
      SATURDAY,
      { authorizeTenant: authorizedFor("t2") },
    );
    assertStrictEquals(refused?.status, 403);
    assertStrictEquals(supabase.rows.length, 0);
  },
);
