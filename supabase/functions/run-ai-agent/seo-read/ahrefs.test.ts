import { assertEquals } from "jsr:@std/assert@1";
import { at } from "../../_shared/pulse/test-fixtures.ts";
import { executeSeoReadTool } from "./execute.ts";
import {
  CLIENT_ID,
  TENANT,
  clientRow,
  fakeSeoDb,
  pluck,
  seoCtx,
} from "./fake-db.test-fixture.ts";

/** A stored Ahrefs report of the client. */
function report(domain: string, report_date: string, extra = {}) {
  return {
    tenant_id: TENANT,
    client_id: CLIENT_ID,
    domain,
    report_type: "site_explorer",
    report_date,
    received_at: `${report_date}T06:00:00Z`,
    report_data: {
      snapshot: {
        dr: 30,
        org_traffic: 1200,
        org_keywords_total: 400,
        org_keywords_top3: 12,
        org_keywords_top10: 60,
        backlinks_live: 900,
        referring_domains: 120,
      },
      organic_keywords: [
        {
          keyword: "שיפוץ דירה",
          position: 2,
          traffic: 300,
          volume: 1900,
          kd: 12,
          url: "https://example.co.il/a",
        },
        {
          keyword: "שיפוץ דירה מחיר",
          position: 5,
          traffic: 100,
          volume: 700,
          kd: 8,
          url: "https://example.co.il/a",
        },
        {
          keyword: "קבלן שיפוצים",
          position: 9,
          traffic: 250,
          volume: 2400,
          kd: 20,
          url: "https://example.co.il/b",
        },
      ],
      tracked_keywords: [
        { keyword: "שיפוץ דירה", position: 2, position_prev_month: 6 },
        { keyword: "שיפוץ אמבטיה", position: null },
      ],
    },
    comparison_data: {
      "3_months": {
        date: "2026-08-01",
        dr: 25,
        org_traffic: 1500,
        org_keywords_total: 400,
        referring_domains: 100,
      },
      "12_months": null,
    },
    ...extra,
  };
}

/** Runs get_ahrefs_snapshot over stored reports. */
async function run(
  reports: Array<Record<string, unknown>>,
  client = clientRow(),
) {
  const db = fakeSeoDb({ clients: [client], ahrefs_reports: reports });
  return await executeSeoReadTool(db, seoCtx(), "get_ahrefs_snapshot", {
    client_id: CLIENT_ID,
    top_n: 2,
  });
}

Deno.test("no stored Ahrefs report says how to get one", async () => {
  const answer = await run([]);
  assertEquals(
    [at(answer, "status"), at(answer, "connected")],
    ["no_data", false],
  );
});

Deno.test(
  "a report for another domain is never quoted as the client's",
  async () => {
    const answer = await run([report("other-site.co.il", "2026-11-10")]);
    assertEquals(at(answer, "status"), "domain_mismatch");
    assertEquals(at(answer, "metrics"), undefined);
  },
);

Deno.test(
  "the latest matching report gives metrics, changes, top keywords, pages and tracked keywords",
  async () => {
    const answer = await run([
      report("other-site.co.il", "2026-11-15"),
      report("www.example.co.il", "2026-10-01", { report_data: {} }),
      report("example.co.il", "2026-11-10"),
    ]);
    assertEquals(at(answer, "status"), "ok");
    assertEquals(at(answer, "report_date"), "2026-11-10");
    assertEquals(at(answer, "metrics", "domain_rating"), 30);
    assertEquals(at(answer, "change_vs_3_months_pct"), {
      domain_rating: 20,
      organic_traffic: -20,
      organic_keywords: 0,
      referring_domains: 20,
    });
    assertEquals(at(answer, "change_vs_12_months_pct"), null);
    assertEquals(pluck(at(answer, "top_keywords"), "keyword"), [
      "שיפוץ דירה",
      "קבלן שיפוצים",
    ]);
    assertEquals(at(answer, "top_pages", "0"), {
      url: "https://example.co.il/a",
      traffic: 400,
      keywords: 2,
      top_keyword: "שיפוץ דירה",
    });
    assertEquals(at(answer, "tracked_keywords"), {
      count: 2,
      ranked: 1,
      top3: 1,
      top10: 1,
      biggest_movers: [
        { keyword: "שיפוץ דירה", position: 2, position_change: 4 },
      ],
    });
  },
);

Deno.test(
  "a client with no domain gets the latest report, marked unverified",
  async () => {
    const answer = await run(
      [report("example.co.il", "2026-11-10")],
      clientRow({ website: null }),
    );
    assertEquals(
      [at(answer, "status"), at(answer, "domain_verified")],
      ["ok", false],
    );
  },
);
