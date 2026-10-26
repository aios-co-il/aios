import { describe, expect, it, vi } from "vitest";
import {
  applyClientCallToPulseSnapshot,
  expandPulseToPlatformGoalRows,
  getPulsePeriodBounds,
  pulseHasNoRecentClientCall,
  type PulseSnapshotRow,
} from "./pulseDashboard";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const LEGACY_FLAG = "לא תועדה שיחה טלפונית עם הלקוח";
const NOW = Date.parse("2026-10-26T09:00:00.000Z");

function snapshot(overrides: Partial<PulseSnapshotRow>): PulseSnapshotRow {
  return {
    client_id: "client-1",
    agency_id: null,
    status: "healthy",
    campaign_goal_mode: "leads",
    is_ecommerce: false,
    spend_7d: 900,
    leads_7d: 12,
    cpl_7d: 75,
    cpl_change_pct: 3,
    purchases_7d: 0,
    revenue_7d: 0,
    roas_7d: null,
    lead_goal_status: "healthy",
    ecommerce_goal_status: null,
    flags: [],
    data_fresh_through: null,
    calculated_at: null,
    last_meta_change_at: null,
    last_meta_change_type: null,
    last_meta_change_actor: null,
    last_meta_change_object: null,
    meta_change_availability: null,
    last_client_call_at: null,
    last_client_call_by: null,
    ...overrides,
  };
}

describe("pulse dashboard client-call indicator (AIO-227)", () => {
  it("is separate from status and follows the 14-day rule", () => {
    expect(pulseHasNoRecentClientCall(snapshot({}), NOW)).toBe(true);
    expect(
      pulseHasNoRecentClientCall(
        snapshot({ last_client_call_at: "2026-10-01T09:00:00.000Z" }),
        NOW,
      ),
    ).toBe(true);
    expect(
      pulseHasNoRecentClientCall(
        snapshot({ last_client_call_at: "2026-10-24T09:00:00.000Z" }),
        NOW,
      ),
    ).toBe(false);
    expect(pulseHasNoRecentClientCall(null, NOW)).toBe(false);
  });

  it("logging a call never changes a current status", () => {
    const critical = snapshot({
      status: "critical",
      lead_goal_status: "critical",
      flags: ["לידים חורף: הוצאה בלי תוצאות"],
    });
    const next = applyClientCallToPulseSnapshot(
      critical,
      "2026-10-26T08:00:00.000Z",
      "דוד",
    );
    expect(next.status).toBe("critical");
    expect(next.lead_goal_status).toBe("critical");
    expect(next.flags).toEqual(["לידים חורף: הוצאה בלי תוצאות"]);
    expect(next.last_client_call_by).toBe("דוד");
    expect(next).not.toHaveProperty("no_recent_client_call");
  });

  it("logging a call clears a legacy call-only warning", () => {
    const next = applyClientCallToPulseSnapshot(
      snapshot({
        status: "warning",
        lead_goal_status: "warning",
        flags: [LEGACY_FLAG],
      }),
      "2026-10-26T08:00:00.000Z",
      "דוד",
    );
    expect(next.status).toBe("healthy");
    expect(next.lead_goal_status).toBe("healthy");
    expect(next.flags).toEqual([]);
  });

  it("a legacy call flag does not turn a platform row yellow", () => {
    const rows = expandPulseToPlatformGoalRows({
      snapshot: snapshot({ status: "warning", flags: [LEGACY_FLAG] }),
      services: ["ppc_meta"],
      tables: [
        {
          id: "table-1",
          client_id: "client-1",
          integration_type: "facebook_insights",
          category: null,
          campaign_active: true,
          last_sync_at: new Date().toISOString(),
          integration_settings: {},
        },
      ],
      records: [
        {
          table_id: "table-1",
          data: {
            date: new Date(Date.now() - 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10),
            spend: 100,
            leads: 2,
          },
        },
      ],
      bounds: getPulsePeriodBounds("last_7_days"),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("healthy");
    expect(rows[0].flags).not.toContain(LEGACY_FLAG);
  });
});
