import { expect, test } from "vitest";
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
  expect(totals.results).toBe(3);
  expect(totals.result_kind).toBe("initiate_checkout");
  expect(totals.result_label).toBe("התחלות תשלום");
  expect(facebookCostPerResult(629, totals.results).toFixed(2)).toBe("209.67");
});

test("rows synced before result_label existed fall back to the kind label", () => {
  const totals = addFacebookResult(emptyFacebookResultTotals(), {
    results: 2,
    result_kind: "purchases",
  });
  expect(totals.result_label).toBe("רכישות");
  expect(facebookResultLabel("initiate_checkout")).toBe("התחלות תשלום");
});

test("a campaign whose result metric changes mid-range is flagged mixed", () => {
  let totals = addFacebookResult(emptyFacebookResultTotals(), checkoutDay(3));
  totals = addFacebookResult(totals, { results: 1, result_kind: "purchases" });
  expect(totals.result_mixed).toBe(true);
  expect(totals.results).toBe(3);
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
  expect(facebookResultsColumnLabel([checkout])).toBe("התחלות תשלום");
  expect(facebookResultsColumnLabel([checkout, purchase])).toBe("תוצאות");
});

test("cost per result is zero when nothing converted", () => {
  expect(facebookCostPerResult(716, 0)).toBe(0);
});
