import { assertEquals } from "jsr:@std/assert@1";
import { RoundBudget } from "./budget.ts";
import { selfTestCollector } from "./collectors/self-test.ts";
import type { Collector } from "./collectors/types.ts";
import type { RoundRequest } from "./request.ts";
import { runTenant } from "./tenant-run.ts";
import { deps } from "./tests/fakes.ts";
import {
  finding,
  rules,
  TENANT,
  type World,
  world,
} from "./tests/fake-world.ts";

const request: RoundRequest = {
  tenantId: null,
  clientId: null,
  collectorIds: null,
  dryRun: false,
  fixtures: null,
  now: null,
};
const owner = {
  user_id: "owner",
  name: "דוד",
  phone: "0503333333",
  roles: ["owner"],
  managed_agency_ids: [],
};

/** runTenant for TENANT over `w` with these manager settings (null: none stored). */
function run(
  w: World,
  manager: Parameters<typeof rules>[0] | null,
  fields: Partial<RoundRequest> = {},
  collectors: Collector[] = [selfTestCollector],
) {
  const tenant = {
    tenant_id: TENANT,
    pulse_alert_rules: manager ? rules(manager) : null,
    last_run_at: null,
  };
  // The round reads the stored settings again before routing and sending.
  w.tenants = [tenant];
  return runTenant(deps(w, collectors), tenant, {
    roundId: "r1",
    budget: RoundBudget.create(60_000, 10),
    sendBudget: RoundBudget.create(140_000, 0),
    request: { ...request, ...fields },
  });
}

/** A collector shipping today that reports an event from 4 days ago. */
const newCollector: Collector = {
  id: "chat_sla",
  kinds: ["unanswered_request"],
  detectorVersion: "1",
  schedule: { trigger: () => Promise.resolve(true) },
  collect: () =>
    Promise.resolve({
      candidates: [
        {
          kind: "unanswered_request",
          fingerprint: "chat:1",
          severity: "warning",
          client_id: "c1",
          agency_id: null,
          source_event_at: "2026-10-30T10:00:00Z",
          summary_he: "לקוח א ביקש דוח ולא קיבל תשובה",
          evidence: {},
          owner_user_id: null,
        },
      ],
      watermark: null,
      coverage: { complete: false, clientIds: null },
    }),
};

Deno.test("runTenant", async (t) => {
  await t.step("a tenant switched off is skipped without a lease", async () => {
    const w = world();
    assertEquals(await run(w, { mode: "off" }), {
      tenant_id: TENANT,
      mode: "off",
      skipped: "off",
    });
    assertEquals(w.leased.size, 0);
  });

  await t.step(
    "observe (the default) records planned actions, sends nothing, logs the run",
    async () => {
      const w = world({ staff: [owner], findings: [finding()] });
      const report = await run(w, null);
      assertEquals(
        [report.mode, report.routed, report.dispatch, report.brief],
        ["observe", 1, null, null],
      );
      assertEquals(w.decisions[0].status, null);
      assertEquals(w.decisions[0].planned_actions?.length, 3);
      assertEquals([w.sent.length, w.deliveries.length], [0, 0]);
      assertEquals(
        w.heartbeats.map((h) => [h.run_kind, h.status]),
        [["manager_round", "ok"]],
      );
      assertEquals(w.leased.size, 0);
    },
  );

  await t.step(
    "david_only at 08:07 sends the brief to the owner once",
    async () => {
      const w = world({
        now: new Date("2026-11-01T06:07:00Z"),
        staff: [owner],
        findings: [finding({ source_event_at: "2026-11-01T05:00:00Z" })],
      });
      const report = await run(w, {
        mode: "david_only",
        notify_since: "2026-10-01T00:00:00Z",
      });
      assertEquals(report.brief?.sent, [{ key: "user:owner", status: "sent" }]);
      assertEquals(w.sent.length, 1);
      assertEquals(
        w.sent[0].message.includes("#1 לקוח א: אין קשר 14 יום"),
        true,
      );
    },
  );

  await t.step(
    "a collector's first run never alerts on an event before it",
    async () => {
      // Tuesday 2026-11-03 12:00 Israel time, team mode since October.
      const w = world({
        now: new Date("2026-11-03T10:00:00Z"),
        staff: [owner],
        clients: [{ id: "c1", agency_id: "a1", name: "לקוח א" }],
        assignments: {
          c1: [
            {
              campaigner_id: "k1",
              user_id: "dana",
              name: "דנה",
              phone: "0501111111",
              campaign_role: true,
              start_date: null,
              end_date: null,
            },
          ],
        },
      });
      await run(w, { mode: "team", notify_since: "2026-10-01T00:00:00Z" }, {}, [
        newCollector,
      ]);
      assertEquals(
        w.findings.map((f) => f.kind),
        ["unanswered_request"],
      );
      assertEquals(
        w.decisions[0].planned_actions?.[0]?.reason,
        "before_notify_since",
      );
      assertEquals([w.deliveries.length, w.sent.length], [0, 0]);
    },
  );

  await t.step("a tenant another call holds is skipped", async () => {
    const w = world();
    w.leased.add(TENANT);
    assertEquals((await run(w, null)).skipped, "locked");
  });

  await t.step(
    "a failure is reported, logged as an error and releases the lease",
    async () => {
      const w = world({ failOn: "findings" });
      const report = await run(w, null);
      assertEquals(report.error, "db down");
      assertEquals(
        w.heartbeats.map((h) => h.status),
        ["error"],
      );
      assertEquals(w.leased.size, 0);
    },
  );

  await t.step(
    "fixtures preview findings and messages and write nothing",
    async () => {
      const w = world({
        staff: [owner],
        clients: [{ id: "c1", agency_id: "a1", name: "לקוח א" }],
      });
      const fixtures = {
        self_test: [
          {
            kind: "client_complaint",
            fingerprint: "chat:1",
            summary_he: "לקוח א כתב 'אני לא מרוצה'",
            client_id: "c1",
          },
        ],
      };
      const report = await run(
        w,
        { mode: "team", notify_since: "2026-10-01T00:00:00Z" },
        { dryRun: true, fixtures },
      );
      assertEquals(report.preview?.candidates.length, 1);
      assertEquals(
        report.preview?.messages.map((m) => m.to),
        ["דוד"],
      );
      assertEquals(
        report.preview?.messages[0].text,
        "היי דוד, יש דבר אחד שדורש טיפול:\n1) #0 לקוח א כתב 'אני לא מרוצה'",
      );
      assertEquals(
        [
          w.findings.length,
          w.heartbeats.length,
          w.sent.length,
          w.leased.size,
          w.slots.length,
        ],
        [0, 0, 0, 0, 0],
      );
    },
  );
});
