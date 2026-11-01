import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import type { HeldPeerNotification } from "../_shared/shabbat/held-peer-notification.ts";
import { fakeHolds, PEER_UPDATE } from "../_shared/shabbat/fake-holds.ts";
import { holdTaskNotificationForShabbat } from "../trigger-automation/shabbat-hold.ts";
import { releaseHeldTaskNotifications } from "./release-held.ts";

const SATURDAY = new Date("2026-10-31T09:00:00Z"); // 11:00 Israel
const SUNDAY_0829 = new Date("2026-11-01T06:29:00Z");
const SUNDAY_0830 = new Date("2026-11-01T06:30:00Z");

type DeliveredBody = HeldPeerNotification["request_body"];

/** Queues PEER_UPDATE on Saturday as the service role. */
const hold = (supabase: ReturnType<typeof fakeHolds>) =>
  holdTaskNotificationForShabbat(supabase, PEER_UPDATE, {
    authorizeTenant: async () => ({ allowed: true }),
    now: SATURDAY,
  });

Deno.test("releaseHeldTaskNotifications", async (t) => {
  await t.step(
    "a peer notification on Saturday is queued once and sent once on Sunday 08:30",
    async () => {
      const supabase = fakeHolds();
      const first = await hold(supabase);
      const again = await hold(supabase);
      assertStrictEquals(first?.body.queued, true);
      assertStrictEquals(again?.body.queued, true);
      assertStrictEquals(supabase.rows.length, 1);
      assertEquals(supabase.rows[0].request_body.data, {
        task_id: "task-1",
        user_id: "u1",
        updater_name: "דוד",
        update_content: "הלקוח אישר את הקריאייטיב",
      });

      const delivered: DeliveredBody[] = [];
      const deliver = async (body: DeliveredBody) => (
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
      assertStrictEquals(delivered[0].trigger_type, "task_update_added");

      const nextMinute = new Date(SUNDAY_0830.getTime() + 60_000);
      assertEquals(
        await releaseHeldTaskNotifications(supabase, deliver, nextMinute),
        [],
      );
      assertStrictEquals(delivered.length, 1);
    },
  );

  await t.step(
    "a hold the worker never released within 24h expires unsent",
    async () => {
      const supabase = fakeHolds();
      await hold(supabase);
      const delivered: DeliveredBody[] = [];
      const released = await releaseHeldTaskNotifications(
        supabase,
        async (body) => delivered.push(body),
        new Date("2026-11-02T07:00:00Z"), // Monday 09:00
      );
      assertStrictEquals(released[0].expired, true);
      assertStrictEquals(delivered.length, 0);
    },
  );

  await t.step(
    "a failed claim delivers nothing and the hold stays open",
    async () => {
      const supabase = fakeHolds(undefined, { claim: "connection reset" });
      await hold(supabase);
      const delivered: DeliveredBody[] = [];
      const released = await releaseHeldTaskNotifications(
        supabase,
        async (body) => delivered.push(body),
        SUNDAY_0830,
      );
      assertEquals(released, []);
      assertStrictEquals(delivered.length, 0);
      assertStrictEquals(supabase.rows[0].released_at, null);
    },
  );

  await t.step(
    "a hold whose stored request_body lost its shape is not sent",
    async () => {
      const supabase = fakeHolds();
      await hold(supabase);
      supabase.rows[0].request_body = { trigger_type: "task_update_added" };
      const delivered: DeliveredBody[] = [];
      const released = await releaseHeldTaskNotifications(
        supabase,
        async (body) => delivered.push(body),
        SUNDAY_0830,
      );
      assertStrictEquals(delivered.length, 0);
      assertStrictEquals(released[0].error, "invalid_request_body");
      assertEquals(supabase.rows[0].release_result, {
        delivered: false,
        error: "invalid_request_body",
      });
    },
  );

  await t.step(
    "a failed release_result write is reported with the delivery",
    async () => {
      const supabase = fakeHolds(undefined, { record: "timeout" });
      await hold(supabase);
      const released = await releaseHeldTaskNotifications(
        supabase,
        async () => ({ sent: true }),
        SUNDAY_0830,
      );
      assertStrictEquals(released.length, 1);
      assertStrictEquals(released[0].released, true);
      assertEquals(released[0].result, { sent: true });
      assertStrictEquals(released[0].record_error, "timeout");
    },
  );
});
