import { assertEquals } from "jsr:@std/assert@1";
import { RoundBudget } from "../budget.ts";
import type { Collector } from "../collectors/types.ts";
import { runTenant } from "../tenant-run.ts";
import { deps } from "../tests/fakes.ts";
import { rules, TENANT, type World, world } from "../tests/fake-world.ts";

const NOTIFY = "2026-10-01T00:00:00Z";
const draftCollector: Collector = {
  id: "group_updates_test",
  kinds: ["card_stale_group"],
  detectorVersion: "1",
  schedule: { trigger: () => Promise.resolve(true) },
  collect: () =>
    Promise.resolve({
      candidates: [
        {
          kind: "card_stale_group",
          fingerprint: "client:c1:group:g1:to:m9",
          severity: "info",
          client_id: "c1",
          agency_id: null,
          source_event_at: "2026-10-31T10:00:00Z",
          summary_he: "לקוח א: עדכון מקבוצת הוואטסאפ שעוד לא נרשם בכרטיס",
          evidence: {
            card_draft: {
              source: "group_digest",
              update_type: "group_summary",
              source_ref: "g1:m9",
              content: "[כרמן · סיכום קבוצה] אישר תקציב",
            },
          },
          owner_user_id: null,
        },
      ],
      watermark: null,
      coverage: { complete: false, clientIds: null },
    }),
};

function teamWorld(): World {
  return world({
    state: ["group_updates_test", "_round"].map((collector) => ({
      collector,
      first_run_at: NOTIFY,
      last_run_at: null,
      last_slot: null,
      watermark: null,
    })),
    clients: [{ id: "c1", agency_id: "a1", name: "לקוח א" }],
    assignments: {
      c1: [
        {
          campaigner_id: "camp1",
          user_id: "dana",
          name: "דנה כהן",
          phone: "0501111111",
          campaign_role: true,
          start_date: null,
          end_date: null,
        },
      ],
    },
  });
}

function round(w: World, cardWrite: boolean, dryRun = false) {
  const manager = {
    mode: "team",
    notify_since: NOTIFY,
    kinds: {
      card_stale_group: { card_write: cardWrite, notify_since: NOTIFY },
    },
  };
  return runTenant(
    deps(w, [draftCollector]),
    { tenant_id: TENANT, pulse_alert_rules: rules(manager), last_run_at: null },
    {
      roundId: "r1",
      budget: RoundBudget.create(60_000, 10),
      sendBudget: RoundBudget.create(140_000, 0),
      request: {
        tenantId: null,
        clientId: null,
        collectorIds: null,
        dryRun,
        fixtures: null,
        now: null,
      },
    },
  );
}

Deno.test("Carmen's own card writes in the round", async (t) => {
  await t.step(
    "team with card_write: the draft is on the card and nobody is asked",
    async () => {
      const w = teamWorld();
      const report = await round(w, true);
      assertEquals(report.card_writes?.written, 1);
      assertEquals(
        w.cardEntries.map((e) => e.sourceRef),
        ["g1:m9"],
      );
      assertEquals(
        w.findings.map((f) => f.status),
        ["resolved"],
      );
      assertEquals([w.decisions, w.deliveries], [[], []]);
      const stats = w.heartbeats[0].stats;
      assertEquals(
        stats && typeof stats === "object" && !Array.isArray(stats)
          ? stats.card_writes
          : null,
        { written: 1, failed: 0 },
      );
    },
  );

  await t.step(
    "team without card_write: the campaigner is asked to approve",
    async () => {
      const w = teamWorld();
      const report = await round(w, false);
      assertEquals(report.card_writes, null);
      assertEquals(w.cardEntries, []);
      assertEquals(
        w.deliveries.map((d) => d.recipient_key),
        ["user:dana"],
      );
    },
  );

  await t.step(
    "a dry run counts the write and plans no message for it",
    async () => {
      const w = teamWorld();
      const report = await round(w, true, true);
      assertEquals(
        [report.card_writes?.planned, report.card_writes?.written],
        [1, 0],
      );
      assertEquals(report.preview?.decisions, []);
      assertEquals(w.cardEntries, []);
    },
  );
});
