import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  compareReportToMeta,
  facebookReportType,
} from "./report-meta-verify.mjs";

Deno.test("matching spend within rounding is ok", () => {
  const r = compareReportToMeta({
    metaRows: [
      {
        campaign_id: "1",
        campaign_name: "יוני 26 | מכירות",
        objective: "OUTCOME_SALES",
        spend: 833.28,
      },
    ],
    aiosRows: [{ campaign_id: "1", spend: 833.1 }],
    reportType: "ecommerce",
  });
  assertStrictEquals(r.ok, true);
  assertStrictEquals(r.mismatches.length, 0);
});

Deno.test(
  "flags spend gaps, missing campaigns and a leads-only report with sales",
  () => {
    const r = compareReportToMeta({
      metaRows: [
        { campaign_id: "1", objective: "OUTCOME_SALES", spend: 500 },
        { campaign_id: "2", objective: "OUTCOME_LEADS", spend: 100 },
      ],
      aiosRows: [
        { campaign_id: "1", spend: 300 },
        { campaign_id: "9", spend: 50 },
      ],
      reportType: "leads",
    });
    assertStrictEquals(r.ok, false);
    assertEquals(r.mismatches.map((m) => m.kind).sort(), [
      "missing_in_aios",
      "missing_in_meta",
      "spend",
    ]);
    assertMatch(r.type_issue, /לידים בלבד/);
  },
);

Deno.test("report type follows the table", () => {
  assertStrictEquals(facebookReportType("facebook_ecommerce", {}), "ecommerce");
  assertStrictEquals(
    facebookReportType("facebook_insights", { campaign_type: "leads" }),
    "leads",
  );
  assertStrictEquals(facebookReportType("facebook_insights", {}), "mixed");
});
