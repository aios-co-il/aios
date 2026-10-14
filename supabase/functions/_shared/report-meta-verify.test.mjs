import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareReportToMeta,
  facebookReportType,
} from "./report-meta-verify.mjs";

test("matching spend within rounding is ok", () => {
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
  assert.equal(r.ok, true);
  assert.equal(r.mismatches.length, 0);
});

test("flags spend gaps, missing campaigns and a leads-only report with sales", () => {
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
  assert.equal(r.ok, false);
  assert.deepEqual(r.mismatches.map((m) => m.kind).sort(), [
    "missing_in_aios",
    "missing_in_meta",
    "spend",
  ]);
  assert.match(r.type_issue, /לידים בלבד/);
});

test("report type follows the table", () => {
  assert.equal(facebookReportType("facebook_ecommerce", {}), "ecommerce");
  assert.equal(
    facebookReportType("facebook_insights", { campaign_type: "leads" }),
    "leads",
  );
  assert.equal(facebookReportType("facebook_insights", {}), "mixed");
});
