import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";
import { fakeSupabase, WEDNESDAY } from "./fake-alert-log.ts";
import { planInstantAlerts } from "./plan-instant-alerts.ts";

const OWNER_PHONE = "972501234567";
const MANAGER_PHONE = "972529999999";

/** A campaign_exception of client c1 on campaign meta:id:1, severity 40. */
function exception(
  overrides: Partial<PulseInstantAlertCandidate> = {},
): PulseInstantAlertCandidate {
  return {
    client_id: "c1",
    client_name: "Acme",
    rule_type: "campaign_exception",
    campaign_key: "meta:id:1",
    fingerprint: "meta:id:1:חריגה:cpl:30",
    severity_score: 40,
    message: "",
    ...overrides,
  };
}

/** Plans `candidates` for org t1 at WEDNESDAY, owner and manager on each. */
function plan(
  candidates: PulseInstantAlertCandidate[],
  supabase = fakeSupabase(),
) {
  return planInstantAlerts(
    { supabase, tenantId: "t1" },
    candidates,
    WEDNESDAY,
    async () => [{ phone: OWNER_PHONE }, { phone: MANAGER_PHONE }],
  );
}

Deno.test("planInstantAlerts", async (t) => {
  await t.step(
    "a finding accepted earlier in the same run is not planned again",
    async () => {
      const connectionLost = exception({
        rule_type: "connection_lost",
        campaign_key: null,
        fingerprint: "connection_lost:c1:open",
        severity_score: null,
      });
      const result = await plan([
        exception(),
        exception(),
        connectionLost,
        connectionLost,
      ]);
      assertEquals(
        result.planned.map((item) => item.candidate.rule_type),
        ["campaign_exception", "connection_lost"],
      );
      assertStrictEquals(result.skipped, 2);
    },
  );

  await t.step(
    "in-run dedupe keeps clients and campaigns apart and resends a materially worse finding",
    async () => {
      const result = await plan([
        exception(),
        exception({ client_id: "c2" }),
        exception({
          campaign_key: "meta:id:2",
          fingerprint: "meta:id:2:חריגה:cpl:30",
        }),
        exception({ severity_score: 44 }),
        exception({ severity_score: 45 }),
      ]);
      assertEquals(
        result.planned.map(
          (item) =>
            `${item.candidate.client_id} ${item.candidate.campaign_key} ${item.candidate.severity_score}`,
        ),
        [
          "c1 meta:id:1 40",
          "c2 meta:id:1 40",
          "c1 meta:id:2 40",
          "c1 meta:id:1 45",
        ],
      );
      assertStrictEquals(result.skipped, 1);
    },
  );

  await t.step(
    "a logged finding is skipped and another org's phones are left out",
    async () => {
      const sentAt = new Date(WEDNESDAY.getTime() - 3600e3).toISOString();
      const logged = {
        client_id: "c1",
        rule_type: "campaign_exception",
        campaign_key: "meta:id:1",
        fingerprint: "meta:id:1:חריגה:cpl:30",
        severity_score: 40,
        sent_at: sentAt,
      };
      const ownLog = await plan(
        [exception()],
        fakeSupabase([
          { ...logged, tenant_id: "t1", recipient_phone: OWNER_PHONE },
        ]),
      );
      assertEquals(ownLog, { planned: [], skipped: 1 });

      const otherOrg = await plan(
        [exception()],
        fakeSupabase([
          { ...logged, tenant_id: "t2", recipient_phone: OWNER_PHONE },
        ]),
      );
      assertEquals(
        otherOrg.planned.map((item) => item.recipients),
        [[MANAGER_PHONE]],
      );

      const everyoneElsewhere = await plan(
        [exception()],
        fakeSupabase([
          {
            ...logged,
            tenant_id: "t2",
            recipient_phone: `${OWNER_PHONE},${MANAGER_PHONE}`,
          },
        ]),
      );
      assertEquals(everyoneElsewhere, { planned: [], skipped: 1 });
    },
  );

  await t.step(
    "a planned alert goes to every recipient on its own until the cap runs",
    async () => {
      const candidate = exception();
      const result = await plan([candidate]);
      assertEquals(result.planned, [
        {
          candidate,
          recipients: [OWNER_PHONE, MANAGER_PHONE],
          individual: [OWNER_PHONE, MANAGER_PHONE],
          sentTo: [],
          summarizedTo: [],
        },
      ]);
    },
  );
});
