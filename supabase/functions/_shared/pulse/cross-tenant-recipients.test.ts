import { assertEquals } from "jsr:@std/assert@1";
import { normalizeNotifyPhone } from "../carmen-notify-target.ts";
import { fakeSupabase, healthy, run, WEDNESDAY } from "./fake-alert-log.ts";

/** The pulse phone run() alerts, as the log stores it. */
const PULSE_PHONE = normalizeNotifyPhone("0501234567");

/** A contacted client with one finding: a stale Meta sync. */
const SHARED = healthy(["סנכרון ישן: Meta"]);

Deno.test("withoutPhonesAlertedElsewhere", async (t) => {
  await t.step(
    "a person the other org already alerted on a shared client is not alerted again",
    async () => {
      const supabase = fakeSupabase();
      const first = await run(supabase, WEDNESDAY, [SHARED], {
        tenantId: "t2",
      });
      assertEquals(first.sends.length, 1);

      const second = await run(supabase, WEDNESDAY, [SHARED], {
        tenantId: "t1",
      });
      assertEquals(second.sends, []);
      assertEquals(second.result.sent, 0);
    },
  );

  await t.step(
    "the other org's alert to someone else does not hold this org's recipient",
    async () => {
      const supabase = fakeSupabase();
      await run(supabase, WEDNESDAY, [SHARED], {
        tenantId: "t2",
        pulsePhone: "0529999999",
      });

      const second = await run(supabase, WEDNESDAY, [SHARED], {
        tenantId: "t1",
      });
      assertEquals(
        second.sends.map((send) => send.phone),
        [PULSE_PHONE],
      );
    },
  );

  await t.step(
    "a different finding from the other org does not hold the alert",
    async () => {
      const supabase = fakeSupabase([
        {
          tenant_id: "t2",
          client_id: "c1",
          rule_type: "connection_lost",
          recipient_phone: PULSE_PHONE,
          fingerprint: "connection_lost:google",
          sent_at: WEDNESDAY.toISOString(),
        },
      ]);
      const { sends } = await run(supabase, WEDNESDAY, [SHARED], {
        tenantId: "t1",
      });
      assertEquals(
        sends.map((send) => send.phone),
        [PULSE_PHONE],
      );
    },
  );
});
