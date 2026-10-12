import assert from "node:assert/strict";
import test from "node:test";
import {
  addFacebookResult,
  emptyFacebookResultTotals,
  facebookCostPerResult,
  facebookResultLabel,
  facebookResultsColumnLabel,
} from "./facebookResultMetric.ts";

const checkoutDay = (results: number) => ({
  campaign_name: "SmartAir - Genesis - מכירות",
  results,
  result_kind: "initiate_checkout",
  result_label: "התחלות תשלום",
  purchases: 0,
});

test("checkout-optimized campaign sums results with its Hebrew label", () => {
  let totals = emptyFacebookResultTotals();
  totals = addFacebookResult(totals, checkoutDay(1));
  totals = addFacebookResult(totals, checkoutDay(2));
  assert.equal(totals.results, 3);
  assert.equal(totals.result_kind, "initiate_checkout");
  assert.equal(totals.result_label, "התחלות תשלום");
  assert.equal(facebookCostPerResult(629, totals.results).toFixed(2), "209.67");
});

test("rows synced before result_label existed fall back to the kind label", () => {
  const totals = addFacebookResult(emptyFacebookResultTotals(), {
    results: 2,
    result_kind: "purchases",
  });
  assert.equal(totals.result_label, "רכישות");
  assert.equal(facebookResultLabel("initiate_checkout"), "התחלות תשלום");
});

test("a campaign whose result metric changes mid-range is flagged mixed", () => {
  let totals = addFacebookResult(emptyFacebookResultTotals(), checkoutDay(3));
  totals = addFacebookResult(totals, { results: 1, result_kind: "purchases" });
  assert.equal(totals.result_mixed, true);
  assert.equal(totals.results, 3);
});

test("column label is specific only when all campaigns share one result", () => {
  const checkout = addFacebookResult(
    emptyFacebookResultTotals(),
    checkoutDay(3),
  );
  const purchase = addFacebookResult(emptyFacebookResultTotals(), {
    results: 0,
    result_kind: "purchases",
  });
  assert.equal(facebookResultsColumnLabel([checkout]), "התחלות תשלום");
  assert.equal(facebookResultsColumnLabel([checkout, purchase]), "תוצאות");
});

test("cost per result is zero when nothing converted", () => {
  assert.equal(facebookCostPerResult(716, 0), 0);
});
