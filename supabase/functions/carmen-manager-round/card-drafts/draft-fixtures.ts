/** A team-mode world and round with a group digest draft, for autowrite.test.ts. */
import { RoundBudget } from "../budget.ts";
import type { Collector } from "../collectors/types.ts";
import { runTenant } from "../tenant-run.ts";
import { deps } from "../tests/fakes.ts";
import { rules, TENANT, type World, world } from "../tests/fake-world.ts";

export const NOTIFY = "2026-10-01T00:00:00Z";

export const draft = {
  source: "group_digest",
  update_type: "group_summary",
  source_ref: "g1:m9",
  content: "[כרמן · סיכום קבוצה] אישר תקציב",
};

/** Reports one card_stale_group candidate for client c1 holding `draft`. */
export const draftCollector: Collector = {
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
          evidence: { card_draft: draft },
          owner_user_id: null,
        },
      ],
      watermark: null,
      coverage: { complete: false, clientIds: null },
    }),
};

/** The draft collector, during whose run the owner switches to observe. */
export function switchingToObserve(w: World): Collector {
  return {
    ...draftCollector,
    collect: (context) => {
      w.tenants = [
        {
          tenant_id: TENANT,
          pulse_alert_rules: rules({ mode: "observe" }),
          last_run_at: null,
        },
      ];
      return draftCollector.collect(context);
    },
  };
}

/** Client c1 with Dana as its campaigner; the collectors first ran at NOTIFY. */
export function teamWorld(fields: Partial<World> = {}): World {
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
    ...fields,
  });
}

/** One tenant run in team mode, card_write on or off, with `collector`. */
export function round(
  w: World,
  cardWrite: boolean,
  dryRun = false,
  collector = draftCollector,
) {
  const manager = {
    mode: "team",
    notify_since: NOTIFY,
    kinds: {
      card_stale_group: { card_write: cardWrite, notify_since: NOTIFY },
    },
  };
  const tenant = {
    tenant_id: TENANT,
    pulse_alert_rules: rules(manager),
    last_run_at: null,
  };
  // The round reads the stored settings again before writing and routing.
  w.tenants = [tenant];
  return runTenant(deps(w, [collector]), tenant, {
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
  });
}
