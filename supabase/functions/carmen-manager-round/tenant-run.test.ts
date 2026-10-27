import { assertEquals } from "jsr:@std/assert@1";
import { RoundBudget } from "./budget.ts";
import { selfTestCollector } from "./collectors/self-test.ts";
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

function run(
  w: World,
  manager: Parameters<typeof rules>[0] | null,
  fields: Partial<RoundRequest> = {},
) {
  const tenant = {
    tenant_id: TENANT,
    pulse_alert_rules: manager ? rules(manager) : null,
    last_run_at: null,
  };
  return runTenant(deps(w, [selfTestCollector]), tenant, {
    roundId: "r1",
    budget: RoundBudget.create(60_000, 10),
    request: { ...request, ...fields },
  });
}

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
