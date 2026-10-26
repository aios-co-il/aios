import assert from "node:assert/strict";
import test from "node:test";
import { readFbInsightsPage } from "./fbInsightsPage.ts";

test("readFbInsightsPage keeps Graph rows and the next page url", () => {
  const page = readFbInsightsPage({
    data: [
      {
        campaign_id: "1",
        campaign_name: "C",
        date_start: "2026-01-01",
        spend: "1.5",
        impressions: "10",
        actions: [{ action_type: "lead", value: "2" }],
      },
    ],
    paging: { next: "https://graph.example/next" },
  });
  assert.equal(page.next, "https://graph.example/next");
  assert.equal(page.rows[0].campaign_id, "1");
  assert.equal(page.rows[0].spend, "1.5");
  assert.equal(page.rows[0].reach, "");
  assert.equal(page.rows[0].adset_id, undefined);
  assert.deepEqual(page.rows[0].actions, [{ action_type: "lead", value: "2" }]);
  assert.equal(page.rows[0].conversions, undefined);
});

test("readFbInsightsPage throws the Graph error message", () => {
  assert.throws(
    () => readFbInsightsPage({ error: { message: "bad token" } }),
    /bad token/,
  );
  assert.throws(() => readFbInsightsPage({ error: { code: 1 } }), /"code":1/);
});

test("readFbInsightsPage tolerates non-object bodies", () => {
  assert.deepEqual(readFbInsightsPage(null), { rows: [], next: null });
  assert.deepEqual(readFbInsightsPage({ data: "x" }), { rows: [], next: null });
});
