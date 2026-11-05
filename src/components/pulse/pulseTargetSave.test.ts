import { beforeEach, describe, expect, it, vi } from "vitest";
import { crmTables } from "./pulseTargetSaveFake";
import {
  pulseTargetSaveKey,
  savePulseTargetToTables,
  TABLE_NOT_UPDATED,
} from "./pulseTargetSave";

vi.mock(
  "@/integrations/supabase/client",
  () => import("./pulseTargetSaveFake"),
);

type Settings = Record<string, Record<string, Record<string, unknown>>>;

/** The stored settings of one table. */
function settingsOf(id: string): Settings {
  const settings = crmTables.rows[id]?.settings;
  return settings && typeof settings === "object" ? { ...settings } : {};
}

/** Carmen's market CPL on the platform, as a sync left the table. */
const MARKET_SETTINGS = {
  last_sync_at: "2026-10-26T05:00:00Z",
  pulse_platform_targets: {
    leads: { cpl: 90, source: "carmen_market", rationale: "בנצ׳מרק" },
  },
};

/** A platform CPL of 70 saved to both Meta tables of the client. */
function savePlatformCpl() {
  return savePulseTargetToTables(
    { tableIds: ["g1", "g2"], goal: "leads", kind: "cpl", value: 70 },
    "tenant-1",
    "user-1",
  );
}

beforeEach(() => {
  crmTables.rows = {};
  crmTables.log = [];
  crmTables.afterWrite = undefined;
});

describe("savePulseTargetToTables", () => {
  it("writes an approved target over the stored settings of each table", async () => {
    // Stored settings, as a sync just wrote them (not the dashboard's cached copy).
    crmTables.rows = {
      g1: { tenant_id: "tenant-1", settings: MARKET_SETTINGS },
      g2: {
        tenant_id: "tenant-1",
        settings: { last_sync_at: "2026-10-26T05:01:00Z" },
      },
    };
    await savePlatformCpl();
    expect(crmTables.log).toEqual([
      "read g1",
      "write g1",
      "read g2",
      "write g2",
    ]);
    for (const id of ["g1", "g2"]) {
      const settings = settingsOf(id);
      expect(settings.last_sync_at).toMatch(/^2026-10-26/);
      expect(settings.pulse_platform_targets.leads).toMatchObject({
        cpl: 70,
        source: "approved",
        set_by: "user-1",
      });
      expect(settings.pulse_platform_targets.leads.rationale).toBeUndefined();
    }
  });

  it("saves a campaign target under its id and stops on a missing table", async () => {
    crmTables.rows = { t1: { tenant_id: "tenant-1", settings: {} } };
    await savePulseTargetToTables(
      {
        tableIds: ["t1"],
        goal: "ecommerce",
        kind: "roas",
        value: 3,
        campaignId: "c9",
        campaignName: "Sale",
      },
      "tenant-1",
      null,
    );
    expect(settingsOf("t1").pulse_targets.c9).toMatchObject({
      roas: 3,
      source: "approved",
      goal: "ecommerce",
    });
    await expect(
      savePulseTargetToTables(
        { tableIds: ["missing"], goal: "leads", kind: "cpl", value: 50 },
        "tenant-1",
        null,
      ),
    ).rejects.toThrow("הטבלה לא נמצאה");
    await expect(
      savePulseTargetToTables(
        { tableIds: [], goal: "leads", kind: "cpl", value: 50 },
        "tenant-1",
        null,
      ),
    ).rejects.toThrow();
  });

  it("never reads or writes a table of another tenant", async () => {
    crmTables.rows = {
      t1: { tenant_id: "tenant-2", settings: { keep: true } },
    };
    await expect(
      savePulseTargetToTables(
        { tableIds: ["t1"], goal: "leads", kind: "cpl", value: 50 },
        "tenant-1",
        null,
      ),
    ).rejects.toThrow("הטבלה לא נמצאה");
    expect(crmTables.log).toEqual(["read t1"]);
    expect(settingsOf("t1")).toEqual({ keep: true });
  });

  it("rejects a table the user may only read and keeps its settings", async () => {
    // RLS lets a read-only role read the table; the update matches no row
    // without an error.
    crmTables.rows = {
      t1: { tenant_id: "tenant-1", settings: { keep: true }, readOnly: true },
    };
    await expect(
      savePulseTargetToTables(
        { tableIds: ["t1"], goal: "leads", kind: "cpl", value: 50 },
        "tenant-1",
        null,
      ),
    ).rejects.toThrow(TABLE_NOT_UPDATED);
    expect(crmTables.log).toEqual(["read t1", "write t1"]);
    expect(settingsOf("t1")).toEqual({ keep: true });
  });

  it("puts the old target back on the tables written before a later table refused", async () => {
    crmTables.rows = {
      g1: { tenant_id: "tenant-1", settings: MARKET_SETTINGS },
      g2: { tenant_id: "tenant-1", settings: {}, readOnly: true },
    };
    // A sync writes g1 right after the save did; the restore keeps its change.
    let synced = false;
    crmTables.afterWrite = (id) => {
      if (id === "g1" && !synced) {
        synced = true;
        crmTables.rows.g1.settings = {
          ...settingsOf("g1"),
          last_sync_at: "2026-10-26T06:00:00Z",
        };
      }
    };
    await expect(savePlatformCpl()).rejects.toThrow(TABLE_NOT_UPDATED);
    expect(crmTables.log).toEqual([
      "read g1",
      "write g1",
      "read g2",
      "write g2",
      "read g1",
      "write g1",
    ]);
    expect(settingsOf("g1")).toEqual({
      ...MARKET_SETTINGS,
      last_sync_at: "2026-10-26T06:00:00Z",
    });
  });

  it("names the tables that keep the new target when restoring them fails too", async () => {
    crmTables.rows = {
      g1: { tenant_id: "tenant-1", settings: {}, name: "Meta ראשית" },
      g2: { tenant_id: "tenant-1", settings: {}, readOnly: true },
    };
    // The user loses update rights on g1 between the save and the restore.
    crmTables.afterWrite = (id) => {
      crmTables.rows[id].readOnly = true;
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(savePlatformCpl()).rejects.toThrow(
      `${TABLE_NOT_UPDATED}. היעד החדש נשאר בטבלאות: Meta ראשית`,
    );
    expect(settingsOf("g1").pulse_platform_targets.leads.cpl).toBe(70);
  });

  it("keys a platform save by its tables and a campaign save by its slot", () => {
    expect(pulseTargetSaveKey({ tableIds: ["g2", "g1"] })).toBe(
      "platform:g1,g2",
    );
    expect(pulseTargetSaveKey({ tableIds: ["t1"], campaignId: "c1" })).toBe(
      "t1:c1",
    );
  });
});
