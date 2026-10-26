import { describe, expect, it } from "vitest";
import {
  pulseTargetSaveKey,
  savePulseTargetToTables,
  type PulseTargetStore,
} from "./pulseTargetSave";

type Settings = Record<string, Record<string, Record<string, unknown>>>;

/** crm_tables in memory, with every read and write recorded in order. */
function fakeStore(rows: Record<string, Record<string, unknown>>) {
  const log: string[] = [];
  const store = {
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => {
            log.push(`read ${id}`);
            return {
              data: id in rows ? { integration_settings: rows[id] } : null,
              error: null,
            };
          },
        }),
      }),
      update: (patch: { integration_settings: Record<string, unknown> }) => ({
        eq: async (_column: string, id: string) => {
          log.push(`write ${id}`);
          rows[id] = patch.integration_settings;
          return { data: null, error: null };
        },
      }),
    }),
  } as unknown as PulseTargetStore;
  return { store, rows, log };
}

describe("savePulseTargetToTables", () => {
  it("writes an approved target over the stored settings of each table", async () => {
    // Stored settings, as a sync just wrote them (not the dashboard's cached copy).
    const { store, rows, log } = fakeStore({
      g1: {
        last_sync_at: "2026-10-26T05:00:00Z",
        pulse_platform_targets: {
          leads: { cpl: 90, source: "carmen_market", rationale: "בנצ׳מרק" },
        },
      },
      g2: { last_sync_at: "2026-10-26T05:01:00Z" },
    });
    await savePulseTargetToTables(
      store,
      { tableIds: ["g1", "g2"], goal: "leads", kind: "cpl", value: 70 },
      "user-1",
    );
    expect(log).toEqual(["read g1", "write g1", "read g2", "write g2"]);
    for (const id of ["g1", "g2"]) {
      const settings = rows[id] as Settings;
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
    const { store, rows } = fakeStore({ t1: {} });
    await savePulseTargetToTables(
      store,
      {
        tableIds: ["t1"],
        goal: "ecommerce",
        kind: "roas",
        value: 3,
        campaignId: "c9",
        campaignName: "Sale",
      },
      null,
    );
    expect((rows.t1 as Settings).pulse_targets.c9).toMatchObject({
      roas: 3,
      source: "approved",
      goal: "ecommerce",
    });
    await expect(
      savePulseTargetToTables(
        store,
        { tableIds: ["missing"], goal: "leads", kind: "cpl", value: 50 },
        null,
      ),
    ).rejects.toThrow("הטבלה לא נמצאה");
    await expect(
      savePulseTargetToTables(
        store,
        { tableIds: [], goal: "leads", kind: "cpl", value: 50 },
        null,
      ),
    ).rejects.toThrow();
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
