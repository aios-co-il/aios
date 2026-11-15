import { assertEquals, assertRejects } from "jsr:@std/assert@1";

import { isRecord } from "../_shared/ads-sync/is-record.ts";
import { ADS_LEVELS } from "../_shared/ads-sync/levels.ts";
import {
  createFakeDb,
  fakeClient,
  type FakeDb,
} from "../_shared/ads-sync/tests/fake-postgrest.ts";
import { writeAdsWindow } from "../_shared/ads-sync/write-window.ts";
import {
  carryStoredVerifiedLeads,
  type VerifiedRecord,
} from "./stored-verified-leads.ts";

const WINDOW = { startDate: "2026-06-01", endDate: "2026-06-03" };

/** A stored campaign row of table t1. */
function stored(date: string, campaignId: string, tenantId = "tenant-1") {
  return {
    id: `${date}-${campaignId}-${tenantId}`,
    table_id: "t1",
    tenant_id: tenantId,
    data: {
      date,
      campaign_id: campaignId,
      verified_leads: 4,
      verified_source: "https://site.example (טופס: צור קשר)",
    },
  };
}

/** verified_leads stored for each campaign day after the run. */
function storedLeads(db: FakeDb): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of db.tables.crm_records) {
    if (isRecord(row.data)) {
      out[`${row.data.date}|${row.data.campaign_id}`] = row.data.verified_leads;
    }
  }
  return out;
}

Deno.test("carryStoredVerifiedLeads", async (t) => {
  await t.step(
    "a day before the Elementor coverage keeps its stored verified leads through the window write",
    async () => {
      const db = createFakeDb({
        crm_records: [stored("2026-06-01", "c1"), stored("2026-06-03", "c1")],
      });
      const records: Array<VerifiedRecord> = [
        { date: "2026-06-01", campaign_id: "c1" },
        { date: "2026-06-03", campaign_id: "c1", verified_leads: 1 },
      ];

      await carryStoredVerifiedLeads(fakeClient(db), {
        tableId: "t1",
        tenantId: "tenant-1",
        records,
        coveredFrom: "2026-06-02",
      });
      await writeAdsWindow(
        { deleteClient: fakeClient(db) },
        {
          tableId: "t1",
          tenantId: "tenant-1",
          window: WINDOW,
          records,
          levelsOk: ADS_LEVELS,
        },
      );

      assertEquals(storedLeads(db), {
        "2026-06-01|c1": 4,
        "2026-06-03|c1": 1,
      });
      assertEquals(records[0], {
        date: "2026-06-01",
        campaign_id: "c1",
        verified_leads: 4,
        verified_source: "https://site.example (טופס: צור קשר)",
      });
    },
  );

  await t.step(
    "matches by campaign and tenant, and reads nothing when every day is covered",
    async () => {
      const db = createFakeDb({
        crm_records: [
          stored("2026-06-01", "c2"),
          stored("2026-06-01", "c1", "other"),
        ],
      });
      const records: Array<VerifiedRecord> = [
        { date: "2026-06-01", campaign_id: "c1" },
      ];

      await carryStoredVerifiedLeads(fakeClient(db), {
        tableId: "t1",
        tenantId: "tenant-1",
        records,
        coveredFrom: "2026-06-02",
      });
      assertEquals(records[0], { date: "2026-06-01", campaign_id: "c1" });

      db.calls.length = 0;
      await carryStoredVerifiedLeads(fakeClient(db), {
        tableId: "t1",
        tenantId: "tenant-1",
        records,
        coveredFrom: "2026-06-01",
      });
      assertEquals(db.calls, []);
    },
  );

  await t.step(
    "a failed read throws instead of letting the write erase them",
    async () => {
      const db = createFakeDb({ crm_records: [stored("2026-06-01", "c1")] });
      db.failures["crm_records:select"] = "timeout";

      await assertRejects(
        () =>
          carryStoredVerifiedLeads(fakeClient(db), {
            tableId: "t1",
            tenantId: "tenant-1",
            records: [{ date: "2026-06-01", campaign_id: "c1" }],
            coveredFrom: "2026-06-02",
          }),
        Error,
        "timeout",
      );
    },
  );
});
