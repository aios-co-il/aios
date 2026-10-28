import {
  assert,
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import type { DirectRunDecision } from "../_shared/automation-run-auth.ts";
import type { HeldPeerNotification } from "../_shared/shabbat/held-peer-notification.ts";
import { fakeHolds, PEER_UPDATE } from "../_shared/shabbat/fake-holds.ts";
import { releaseHeldTaskNotifications } from "../task-notification-worker/release-held.ts";
import {
  heldPeerNotification,
  holdTaskNotificationForShabbat,
} from "./shabbat-hold.ts";

const SATURDAY = new Date("2026-10-31T09:00:00Z"); // 11:00 Israel
const SUNDAY_0830 = new Date("2026-11-01T06:30:00Z");

type HoldOptions = {
  authorizeTenant: (tenantId: string | null) => Promise<DirectRunDecision>;
};
type DeliveredBody = HeldPeerNotification["request_body"];

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
  supabase: ReturnType<typeof fakeHolds>,
  body: unknown,
  now: Date,
  options: HoldOptions = asService,
) => holdTaskNotificationForShabbat(supabase, body, { ...options, now });
const update = PEER_UPDATE;

/** Runs the worker's release on Sunday 08:30 and returns what it sent. */
async function releasedOnSunday(supabase: ReturnType<typeof fakeHolds>) {
  const delivered: DeliveredBody[] = [];
  await releaseHeldTaskNotifications(
    supabase,
    async (body) => delivered.push(body),
    SUNDAY_0830,
  );
  return delivered;
}

Deno.test("holdTaskNotificationForShabbat", async (t) => {
  await t.step("outside the window nothing is held", async () => {
    const supabase = fakeHolds();
    assertStrictEquals(await hold(supabase, update, SUNDAY_0830), null);
    assertStrictEquals(supabase.rows.length, 0);
  });

  await t.step(
    "a worker-driven notification on Saturday is refused, not queued",
    async () => {
      const supabase = fakeHolds();
      const held = await hold(
        supabase,
        { trigger_type: "task_assigned", data: { task_id: "task-1" } },
        SATURDAY,
      );
      assert(held && held.status === 202);
      const body = held.body;
      assertStrictEquals(body.sent, false);
      assertStrictEquals(body.handled, true);
      assertStrictEquals(body.hold_until, SUNDAY_0830.toISOString());
      assertStrictEquals(body.queued, undefined);
      assertStrictEquals(supabase.rows.length, 0); // the worker marker carries it
    },
  );
});

Deno.test("heldPeerNotification", async (t) => {
  await t.step("collaborator holds are keyed per added campaigner", () => {
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
});

// The hold queue must not widen trigger-automation's tenant check.
Deno.test("holdTaskNotificationForShabbat tenant check", async (t) => {
  await t.step(
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

  await t.step(
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
      assertStrictEquals((await releasedOnSunday(supabase)).length, 0);
    },
  );

  await t.step(
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

      const delivered = await releasedOnSunday(supabase);
      assertEquals(delivered.map((body) => body.tenant_id).sort(), [
        "t-board",
        "t-client",
      ]);
    },
  );

  await t.step(
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

  await t.step(
    "a peer notification for a task that does not exist is not queued",
    async () => {
      const supabase = fakeHolds({ tasks: [] });
      const result = await hold(supabase, update, SATURDAY);
      assertStrictEquals(result?.status, 202);
      assertStrictEquals(result?.body.queued, false);
      assertStrictEquals(supabase.rows.length, 0);
    },
  );

  await t.step(
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

      const delivered = await releasedOnSunday(supabase);
      assertStrictEquals(delivered.length, 1);
      assertStrictEquals(delivered[0].tenant_id, "t-shared");
    },
  );

  await t.step(
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
});
