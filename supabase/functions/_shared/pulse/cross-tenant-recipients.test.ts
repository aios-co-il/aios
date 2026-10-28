import { assertEquals } from "jsr:@std/assert@1";
import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";
import { withoutPhonesAlertedElsewhere } from "./cross-tenant-recipients.ts";
import {
  fakeSupabase,
  healthy,
  OWNER_RECIPIENT,
  run,
  WEDNESDAY,
} from "./fake-alert-log.ts";
import {
  connectionLostFingerprint,
  noContactFingerprint,
} from "./instant-alert-fingerprint.ts";

/** The phone run() alerts, as the log stores it. */
const PULSE_PHONE = OWNER_RECIPIENT.phone;

/** t2 shares agency a1 with t1 (run()'s tenant). */
const GRANT = {
  agency_id: "a1",
  source_tenant_id: "t2",
  accessing_tenant_id: "t1",
};

/** A contacted client of agency a1 with one finding: a stale Meta sync. */
const SHARED = { ...healthy(["סנכרון ישן: Meta"]), agency_id: "a1" };

/** An a1 client with one campaign exception, on campaign k1. */
const CAMPAIGN = {
  ...healthy(),
  agency_id: "a1",
  campaign_breakdown: [
    { campaign_key: "k1", alert_eligible: true, status_reason: "cpl_high" },
  ],
};

const LOST: Pick<PulseInstantAlertCandidate, "rule_type" | "fingerprint"> = {
  rule_type: "connection_lost",
  fingerprint: connectionLostFingerprint("c1"),
};

const HOUR_AGO = new Date(WEDNESDAY.getTime() - 3600e3).toISOString();

/** A log row of `tenantId` for client c1, sent to PULSE_PHONE an hour ago. */
const logRow = (tenantId: string, row: Record<string, unknown>) => ({
  tenant_id: tenantId,
  client_id: "c1",
  recipient_phone: PULSE_PHONE,
  sent_at: HOUR_AGO,
  ...row,
});

/** The phones of queued sends or recipients, in order. */
const phones = (sends: Array<{ phone: string | null }>) =>
  sends.map((send) => send.phone);

Deno.test("withoutPhonesAlertedElsewhere", async (t) => {
  await t.step(
    "a person the other org already alerted on a shared client is not alerted again",
    async () => {
      const supabase = fakeSupabase([], { grants: [GRANT] });
      const first = await run(supabase, WEDNESDAY, [SHARED], {
        tenantId: "t2",
      });
      assertEquals(first.sends.length, 1);

      const second = await run(supabase, WEDNESDAY, [SHARED]);
      assertEquals(second.sends, []);
      assertEquals(second.result.sent, 0);
    },
  );

  await t.step(
    "the other org's alert to someone else does not hold this org's recipient",
    async () => {
      const supabase = fakeSupabase([], { grants: [GRANT] });
      await run(supabase, WEDNESDAY, [SHARED], {
        tenantId: "t2",
        reportRecipients: [
          { name: "Other", phone: "972529999999", source: "configured" },
        ],
      });

      const second = await run(supabase, WEDNESDAY, [SHARED]);
      assertEquals(phones(second.sends), [PULSE_PHONE]);
    },
  );

  await t.step(
    "an org without a grant on the client's agency does not hold the alert",
    async () => {
      const supabase = fakeSupabase([logRow("t3", LOST)], { grants: [GRANT] });
      const { sends } = await run(supabase, WEDNESDAY, [SHARED]);
      assertEquals(phones(sends), [PULSE_PHONE]);
    },
  );

  await t.step(
    "a different finding from the other org does not hold the alert",
    async () => {
      const lastCall = WEDNESDAY.getTime() - 20 * 86400e3;
      const earlierCall = lastCall - 10 * 86400e3;
      const supabase = fakeSupabase(
        [
          logRow("t2", {
            rule_type: "no_contact",
            fingerprint: noContactFingerprint("c1", earlierCall),
          }),
        ],
        { grants: [GRANT] },
      );
      const stale = {
        ...healthy(),
        agency_id: "a1",
        last_client_call_at: new Date(lastCall).toISOString(),
      };
      const { sends } = await run(supabase, WEDNESDAY, [stale]);
      assertEquals(phones(sends), [PULSE_PHONE]);
    },
  );

  await t.step(
    "the other org's alert outside the throttle window does not hold the alert",
    async () => {
      const dayAndHourAgo = new Date(WEDNESDAY.getTime() - 25 * 3600e3);
      const supabase = fakeSupabase(
        [logRow("t2", { ...LOST, sent_at: dayAndHourAgo.toISOString() })],
        { grants: [GRANT] },
      );
      const { sends } = await run(supabase, WEDNESDAY, [SHARED]);
      assertEquals(phones(sends), [PULSE_PHONE]);
    },
  );

  await t.step(
    "the other org's alert on another campaign does not hold this campaign's alert",
    async () => {
      // A legacy NULL-fingerprint row matches any finding, so only the
      // campaign scope keeps it from holding k1.
      const supabase = fakeSupabase(
        [
          logRow("t2", {
            rule_type: "campaign_exception",
            campaign_key: "k2",
            fingerprint: null,
          }),
        ],
        { grants: [GRANT] },
      );
      const { sends } = await run(supabase, WEDNESDAY, [CAMPAIGN], {
        analyzeException: async () => ({ confirmed: true }),
      });
      assertEquals(phones(sends), [PULSE_PHONE]);
    },
  );

  await t.step(
    "a campaign exception everyone already got elsewhere makes no AI call",
    async () => {
      const supabase = fakeSupabase(
        [
          logRow("t2", {
            rule_type: "campaign_exception",
            campaign_key: "k1",
            fingerprint: "k1:cpl_high:no_target:none",
            severity_score: 1,
          }),
        ],
        { grants: [GRANT] },
      );
      let aiCalls = 0;
      const { result, sends } = await run(supabase, WEDNESDAY, [CAMPAIGN], {
        analyzeException: async () => {
          aiCalls += 1;
          return { confirmed: true };
        },
      });
      assertEquals(sends, []);
      assertEquals(aiCalls, 0);
      assertEquals(result.analyzed, 0);
    },
  );

  await t.step("a failed lookup alerts everyone", async () => {
    for (const table of ["agency_tenant_access", "pulse_instant_alert_log"]) {
      const supabase = fakeSupabase([logRow("t2", LOST)], {
        grants: [GRANT],
        failing: [table],
      });
      const recipients = await withoutPhonesAlertedElsewhere(
        { supabase, tenantId: "t1" },
        { client_id: "c1", client_name: "Acme", message: "", ...LOST },
        "a1",
        [{ phone: PULSE_PHONE }],
        24,
        WEDNESDAY,
      );
      assertEquals(phones(recipients), [PULSE_PHONE], table);
    }
  });
});
