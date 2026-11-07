import { expect, test } from "vitest";
import {
  aggregateOrdersByAttribution,
  buildWooAttributionLabel,
  extractWooOrderAttribution,
  GOOGLE_WOO_ATTRIBUTION_CLIENT_IDS,
  isGooglePaidWooAttribution,
  shouldUseGoogleWooAttributionOverlay,
  summarizeGoogleAttributedWooOrders,
  type WooOrderAttribution,
} from "./wooAttribution.ts";

function attribution(
  fields: Partial<WooOrderAttribution> & { label: string },
): WooOrderAttribution {
  return {
    source_type: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    referrer: null,
    session_entry: null,
    device_type: null,
    ...fields,
  };
}

test("extractWooOrderAttribution reads WC meta fields", () => {
  const attr = extractWooOrderAttribution([
    { key: "_wc_order_attribution_source_type", value: "utm" },
    { key: "_wc_order_attribution_utm_source", value: "fb" },
    { key: "_wc_order_attribution_utm_medium", value: "paid" },
    { key: "_wc_order_attribution_utm_campaign", value: "120250917574950776" },
    { key: "_wc_order_attribution_referrer", value: "https://facebook.com/" },
  ]);
  expect(attr?.utm_source).toBe("fb");
  expect(attr?.utm_medium).toBe("paid");
  expect(attr?.label).toBe("Facebook ממומן");
});

test("extractWooOrderAttribution returns null when no attribution meta", () => {
  expect(extractWooOrderAttribution([{ key: "_ga_tracked", value: "1" }])).toBe(
    null,
  );
});

test("buildWooAttributionLabel maps direct traffic", () => {
  expect(
    buildWooAttributionLabel({ source_type: "typein", utm_source: "(direct)" }),
  ).toBe("ישיר / Direct");
});

test("aggregateOrdersByAttribution groups valid orders by label", () => {
  const rows = aggregateOrdersByAttribution([
    {
      status: "processing",
      total: 500,
      attribution: attribution({ label: "Facebook ממומן" }),
    },
    {
      status: "completed",
      total: 300,
      attribution: attribution({ label: "Facebook ממומן" }),
    },
    {
      status: "processing",
      total: 100,
      attribution: attribution({ label: "ישיר / Direct" }),
    },
    {
      status: "cancelled",
      total: 999,
      attribution: attribution({ label: "Facebook ממומן" }),
    },
  ]);
  const fb = rows.find((r) => r.label === "Facebook ממומן");
  expect(fb?.orders).toBe(2);
  expect(fb?.revenue).toBe(800);
});

test("isGooglePaidWooAttribution detects google/cpc and gclid", () => {
  expect(
    isGooglePaidWooAttribution({
      source_type: "utm",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      referrer: null,
      session_entry: null,
      device_type: null,
      label: "Google Ads",
    }),
  ).toBe(true);
  expect(
    isGooglePaidWooAttribution({
      source_type: "utm",
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      referrer: null,
      session_entry: "https://avieli.co.il/?gclid=abc",
      device_type: null,
      label: "Google Ads",
    }),
  ).toBe(true);
  expect(
    isGooglePaidWooAttribution({
      source_type: "organic",
      utm_source: "google",
      utm_medium: "organic",
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      referrer: "https://google.com/",
      session_entry: null,
      device_type: null,
      label: "Google אורגני",
    }),
  ).toBe(false);
});

test("shouldUseGoogleWooAttributionOverlay is opt-in per client (Avieli only by default)", () => {
  const avieliId = Array.from(GOOGLE_WOO_ATTRIBUTION_CLIENT_IDS)[0];
  expect(shouldUseGoogleWooAttributionOverlay(avieliId)).toBe(true);
  expect(shouldUseGoogleWooAttributionOverlay("other-client-id")).toBe(false);
  expect(shouldUseGoogleWooAttributionOverlay(null)).toBe(false);
});

test("shouldUseGoogleWooAttributionOverlay respects table integration_settings override", () => {
  expect(
    shouldUseGoogleWooAttributionOverlay("any-client", {
      use_woo_google_attribution: true,
    }),
  ).toBe(true);
  const avieliId = Array.from(GOOGLE_WOO_ATTRIBUTION_CLIENT_IDS)[0];
  expect(
    shouldUseGoogleWooAttributionOverlay(avieliId, {
      use_woo_google_attribution: false,
    }),
  ).toBe(false);
});

test("summarizeGoogleAttributedWooOrders splits paid vs organic Google", () => {
  const summary = summarizeGoogleAttributedWooOrders([
    {
      status: "processing",
      total: 500,
      attribution: attribution({
        label: "Google Ads",
        utm_source: "google",
        utm_medium: "cpc",
      }),
    },
    {
      status: "completed",
      total: 150,
      attribution: attribution({
        label: "Google אורגני",
        utm_source: "google",
        utm_medium: "organic",
      }),
    },
    {
      status: "processing",
      total: 200,
      attribution: attribution({ label: "Facebook ממומן" }),
    },
    {
      status: "cancelled",
      total: 999,
      attribution: attribution({ label: "Google ממומן" }),
    },
  ]);
  expect(summary.paidOrders).toBe(1);
  expect(summary.paidRevenue).toBe(500);
  expect(summary.organicOrders).toBe(1);
  expect(summary.organicRevenue).toBe(150);
});
