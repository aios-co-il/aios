/** A caller, a seeded client and pulse helpers for the pulse-target tool tests. */
import type { PulseTargetToolContext } from "./context.ts";
import type { FakeDb } from "./fake-db.ts";

type Row = Record<string, unknown>;

export const NOW = new Date("2026-10-26T08:00:00.000Z");

export const RATIONALE =
  "ענף שיפוצים בישראל: CPL של ₪50–70 בפייסבוק; ללקוח ממוצע ₪52 ב־4 השבועות האחרונים";

/** An owner asking in tenant-1, with access to every client. */
export function ctx(
  over: Partial<PulseTargetToolContext> = {},
): PulseTargetToolContext {
  return {
    tenantId: "tenant-1",
    accessibleTenantIds: ["tenant-1"],
    actorUserId: "user-1",
    agentId: "agent-1",
    callerRole: "owner",
    callerPhone: null,
    isManagerRole: true,
    isTeamManager: false,
    managedAgencyIds: [],
    callerCampaignerId: null,
    assertClientAccess: async () => {},
    now: () => NOW,
    ...over,
  };
}

/** client-1 with a Meta and a Google table and one lead campaign in its pulse. */
export function seed(settings: Row = {}): Record<string, Row[]> {
  return {
    crm_tables: [
      {
        id: "t-meta",
        client_id: "client-1",
        tenant_id: "tenant-1",
        integration_type: "facebook_insights",
        integration_settings: { last_sync_at: "2026-10-26", ...settings },
      },
      {
        id: "t-google",
        client_id: "client-1",
        tenant_id: "tenant-1",
        integration_type: "google_ads",
        integration_settings: {},
      },
    ],
    clients: [{ id: "client-1", name: "שיפוצי אבי", tenant_id: "tenant-1" }],
    campaign_pulse_snapshots: [
      {
        client_id: "client-1",
        tenant_id: "tenant-1",
        calculated_at: "2026-10-26T04:00:00Z",
        campaign_breakdown: [
          {
            campaign_key: "k1",
            campaign_id: "c1",
            campaign_name: "לידים שיפוץ",
            client_id: "client-1",
            table_id: "t-meta",
            platform: "meta",
            goal: "leads",
            spend_7d: 900,
            delivery_status: "active",
          },
        ],
      },
    ],
    agent_approval_queue: [],
  };
}

/** The campaign_breakdown rows of the seeded snapshot (mutable). */
export function pulseRows(db: FakeDb): Row[] {
  const breakdown = db.tables.campaign_pulse_snapshots[0]?.campaign_breakdown;
  if (!Array.isArray(breakdown)) {
    throw new Error("the seed has no pulse rows");
  }
  return breakdown;
}

/** The pulse row added last. */
export function lastPulseRow(db: FakeDb): Row {
  const row = pulseRows(db).at(-1);
  if (!row) {
    throw new Error("the seed has no pulse rows");
  }
  return row;
}

/** Adds a spending Meta campaign of client-1 to the pulse. */
export function addPulseRow(db: FakeDb, row: Row): void {
  pulseRows(db).push({
    client_id: "client-1",
    table_id: "t-meta",
    platform: "meta",
    spend_7d: 500,
    delivery_status: "active",
    ...row,
  });
}

/** A crm_tables row's stored integration_settings. */
export function settingsOf(db: FakeDb, tableId: string): unknown {
  return db.tables.crm_tables.find((table) => table.id === tableId)
    ?.integration_settings;
}
