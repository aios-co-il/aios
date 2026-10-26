/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import {
  heldPeerNotification,
  holdTaskNotificationForShabbat,
  releaseHeldTaskNotifications,
  taskNotificationsHeldUntil,
} from "./task-notification-hold.ts";

/** task_notification_holds in memory, with the open-key unique index. */
function fakeHolds() {
  const rows: any[] = [];
  let nextId = 1;
  const from = (_table: string) => {
    const filters: Array<(row: any) => boolean> = [];
    let patch: any = null;
    let limit = Infinity;
    const matching = () => rows.filter((row) => filters.every((f) => f(row)));
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
        return { data: hit ? { id: hit.id } : null, error: null };
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
  assert.equal(
    await holdTaskNotificationForShabbat(supabase, update, SUNDAY_0830),
    null,
  );
  assert.equal(supabase.rows.length, 0);
});

test("a worker-driven notification on Saturday is refused, not queued", async () => {
  const supabase = fakeHolds();
  const held = await holdTaskNotificationForShabbat(
    supabase,
    { trigger_type: "task_assigned", data: { task_id: "task-1" } },
    SATURDAY,
  );
  assert.equal(held?.sent, false);
  assert.equal(held?.handled, true);
  assert.equal(held?.hold_until, SUNDAY_0830.toISOString());
  assert.equal(held?.queued, undefined);
  assert.equal(supabase.rows.length, 0); // the worker marker carries it
});

test("a peer notification on Saturday is queued once and sent once on Sunday 08:30", async () => {
  const supabase = fakeHolds();
  const first = await holdTaskNotificationForShabbat(
    supabase,
    update,
    SATURDAY,
  );
  const again = await holdTaskNotificationForShabbat(
    supabase,
    update,
    SATURDAY,
  );
  assert.equal(first?.queued, true);
  assert.equal(again?.queued, true);
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
  await holdTaskNotificationForShabbat(supabase, update, SATURDAY);
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
