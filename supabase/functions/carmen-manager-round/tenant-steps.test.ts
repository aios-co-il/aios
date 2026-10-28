import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../_shared/manager-round/settings.ts";
import { RoundBudget } from "./budget.ts";
import { draft } from "./card-drafts/draft-fixtures.ts";
import type { Collector } from "./collectors/types.ts";
import type { RoundDeps } from "./deps.ts";
import { runSteps } from "./tenant-steps.ts";
import { deps } from "./tests/fakes.ts";
import {
  delivery,
  finding,
  rules,
  TENANT,
  type World,
  world,
} from "./tests/fake-world.ts";

const team = { mode: "team", notify_since: "2026-10-01T00:00:00Z" };

const dana = {
  campaigner_id: "k1",
  user_id: "dana",
  name: "דנה",
  phone: "0501111111",
  campaign_role: true,
  start_date: null,
  end_date: null,
};

/**
 * What the owner's switch to observe does in the database: the new settings,
 * planned messages cancelled as rollout_changed and ladders reset
 * (carmen_manager_settings_guard, carmen_manager_reset_ladders).
 */
function ownerSwitchesToObserve(w: World): void {
  w.tenants = [
    {
      tenant_id: TENANT,
      pulse_alert_rules: rules({ mode: "observe" }),
      last_run_at: null,
    },
  ];
  for (const row of w.deliveries.filter((d) => d.status === "planned")) {
    Object.assign(row, { status: "cancelled", error: "rollout_changed" });
  }
  for (const row of w.findings) {
    Object.assign(row, {
      escalation_level: null,
      ladder_started_at: null,
      next_action_at: w.now.toISOString(),
    });
  }
}

/**
 * Team mode on a Tuesday noon with a client complaint for Dana's client;
 * `planned` routes it already, with Dana's message planned and due.
 */
function complaintWorld(planned: boolean): World {
  const complaint = finding({
    kind: "client_complaint",
    client_id: "c1",
    source_event_at: "2026-11-03T08:30:00Z",
    summary_he: "לקוח א כתב שהוא לא מרוצה",
    ...(planned
      ? {
          status: "notified",
          escalation_level: 0,
          ladder_started_at: "2026-11-03T09:00:00Z",
          next_action_at: "2026-11-03T13:00:00Z",
          routed: true,
        }
      : {}),
  });
  return world({
    now: new Date("2026-11-03T10:00:00Z"),
    tenants: [
      { tenant_id: TENANT, pulse_alert_rules: rules(team), last_run_at: null },
    ],
    clients: [{ id: "c1", agency_id: "a1", name: "לקוח א" }],
    assignments: { c1: [dana] },
    findings: [complaint],
    deliveries: planned
      ? [delivery({ finding_id: complaint.id, recipient_key: "user:dana" })]
      : [],
    // The complaints collector ran before, so its first run sets no floor.
    state: [
      {
        collector: "complaints",
        first_run_at: "2026-10-01T00:00:00Z",
        last_run_at: "2026-11-03T09:45:00Z",
        last_slot: null,
        watermark: null,
      },
    ],
  });
}

/** A complaints collector that finds nothing new; `during` runs while it collects. */
function complaintsCollector(during: () => void = () => {}): Collector {
  return {
    id: "complaints",
    kinds: ["client_complaint"],
    detectorVersion: "1",
    schedule: { trigger: () => Promise.resolve(true) },
    collect: () => {
      during();
      return Promise.resolve({
        candidates: [],
        watermark: null,
        coverage: { complete: false, clientIds: null },
      });
    },
  };
}

/** One tenant's steps, started in team mode. */
function steps(roundDeps: RoundDeps) {
  return runSteps(roundDeps, TENANT, resolveManagerSettings(rules(team)), {
    roundId: "r1",
    budget: RoundBudget.create(60_000, 10),
    sendBudget: RoundBudget.create(140_000, 0),
    request: {
      tenantId: null,
      clientId: null,
      collectorIds: null,
      dryRun: false,
      fixtures: null,
      now: null,
    },
  });
}

Deno.test("runSteps after a switch to observe sends nothing", async (t) => {
  await t.step(
    "a switch while collectors run: the cancelled message is not planned again",
    async () => {
      const w = complaintWorld(true);
      await steps(
        deps(w, [complaintsCollector(() => ownerSwitchesToObserve(w))]),
      );
      assertEquals(w.sent, []);
      assertEquals(
        w.deliveries.map((d) => [d.status, d.error]),
        [["cancelled", "rollout_changed"]],
      );
    },
  );

  await t.step(
    "a switch while routing looks up people: what routing planned does not go",
    async () => {
      const w = complaintWorld(false);
      const roundDeps = deps(w, [complaintsCollector()]);
      const campaigners = roundDeps.directory.campaigners;
      roundDeps.directory = {
        ...roundDeps.directory,
        campaigners: (tenantId, clientId) => {
          ownerSwitchesToObserve(w);
          return campaigners(tenantId, clientId);
        },
      };
      const report = await steps(roundDeps);
      assertEquals([w.sent, report.dispatch], [[], null]);
      assertEquals(
        w.deliveries.map((d) => [d.recipient_key, d.status]),
        [["user:dana", "planned"]],
      );
    },
  );

  await t.step(
    "a switch after the messages were claimed: they go back to planned",
    async () => {
      const w = complaintWorld(true);
      const roundDeps = deps(w, [complaintsCollector()]);
      const claim = roundDeps.deliveries.claim;
      roundDeps.deliveries = {
        ...roundDeps.deliveries,
        claim: async (tenantId, limit) => {
          const rows = await claim(tenantId, limit);
          ownerSwitchesToObserve(w);
          return rows;
        },
      };
      const report = await steps(roundDeps);
      assertEquals(w.sent, []);
      assertEquals(report.dispatch?.deferred, 1);
      assertEquals(
        w.deliveries.map((d) => d.status),
        ["planned"],
      );
    },
  );
});

/**
 * complaintWorld without its complaint: team mode with card_write on and one
 * open group draft for Dana's client per event time in `events`.
 */
function draftsWorld(events: string[]): World {
  const w = complaintWorld(false);
  const kinds = {
    card_stale_group: { card_write: true, notify_since: team.notify_since },
  };
  w.tenants = [
    {
      tenant_id: TENANT,
      pulse_alert_rules: rules({ ...team, kinds }),
      last_run_at: null,
    },
  ];
  w.findings = events.map((at, i) =>
    finding({
      kind: "card_stale_group",
      client_id: "c1",
      source_event_at: at,
      evidence: { card_draft: { ...draft, source_ref: `g1:m${i}` } },
    }),
  );
  return w;
}

Deno.test("runSteps with Carmen's own card writes", async (t) => {
  await t.step(
    "a switch to observe during the writes: the rest is neither written nor routed",
    async () => {
      const due = "2026-11-03T08:30:00Z";
      const w = draftsWorld([due, due]);
      const roundDeps = deps(w, [complaintsCollector()]);
      const writeEntry = roundDeps.cardDrafts.writeEntry;
      roundDeps.cardDrafts = {
        ...roundDeps.cardDrafts,
        writeEntry: async (input) => {
          const entry = await writeEntry(input);
          ownerSwitchesToObserve(w);
          return entry;
        },
      };
      const report = await steps(roundDeps);
      assertEquals(
        [report.card_writes?.written, report.card_writes?.stopped],
        [1, true],
      );
      assertEquals(
        w.findings.map((f) => f.status),
        ["resolved", "open"],
      );
      assertEquals(w.deliveries, []);
    },
  );

  await t.step(
    "drafts about events before notify_since never keep a due one out of the scan",
    async () => {
      const w = draftsWorld([
        ...Array(50).fill("2026-09-30T10:00:00Z"),
        "2026-11-03T08:30:00Z",
      ]);
      const report = await steps(deps(w, [complaintsCollector()]));
      assertEquals(report.card_writes?.written, 1);
      assertEquals(w.findings[50].status, "resolved");
    },
  );
});
