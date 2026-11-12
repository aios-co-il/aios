import { assertEquals } from "jsr:@std/assert@1";
import type { SharedRecordRow } from "./event-totals.ts";
import {
  readsCampaignRowsOnly,
  type SharedRecordTable,
  tagTableRecords,
} from "./table-records.ts";

/** A table of this kind. */
function table(integrationType: string | null): SharedRecordTable {
  return { id: "t1", name: "Report", integration_type: integrationType };
}

const ROW: SharedRecordRow = {
  id: "r1",
  data: { date: "2026-09-01", spend: 10 },
  created_at: "2026-09-02T00:00:00Z",
};

Deno.test("Meta tables read the rows the dashboards sum only", () => {
  assertEquals(
    [
      "facebook_insights",
      "facebook_ecommerce",
      "google_ads",
      "tiktok",
      "google_analytics",
      null,
    ].map((type) => readsCampaignRowsOnly(table(type))),
    [true, true, false, false, false, false],
  );
});

Deno.test("records carry their table but not its settings", () => {
  assertEquals(tagTableRecords(table("google_ads"), [ROW]), [
    {
      ...ROW,
      _source: "google_ads",
      _tableId: "t1",
      _tableName: "Report",
    },
  ]);
});
