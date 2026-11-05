import { expect, test } from "vitest";
import {
  adAccountShortcutLabel,
  getAdAccountLinks,
  getAdAccountUrl,
} from "./adAccountUrl.ts";

test("facebook insights opens Ads Manager with the account id", () => {
  expect(
    getAdAccountUrl({
      integration_type: "facebook_insights",
      integration_settings: { ad_account_id: "act_120245824650190459" },
    }),
  ).toBe(
    "https://business.facebook.com/adsmanager/manage/campaigns?act=120245824650190459",
  );
});

test("google ads opens the customer overview", () => {
  expect(
    getAdAccountUrl({
      integration_type: "google_ads",
      integration_settings: { customer_id: "123-456-7890" },
    }),
  ).toBe("https://ads.google.com/aw/overview?__e=1234567890");
});

test("a dashboard collects one shortcut per ads account", () => {
  const links = getAdAccountLinks([
    { integration_type: "google_analytics", integration_settings: {} },
    {
      integration_type: "facebook_insights",
      integration_settings: { ad_account_id: "act_111" },
    },
    {
      integration_type: "facebook_ecommerce",
      integration_settings: { ad_account_id: "111" },
    },
    {
      integration_type: "google_ads",
      integration_settings: { customer_id: "123-456-7890" },
    },
  ]);
  expect(links).toStrictEqual([
    {
      url: "https://business.facebook.com/adsmanager/manage/campaigns?act=111",
      label: "חשבון Facebook",
    },
    {
      url: "https://ads.google.com/aw/overview?__e=1234567890",
      label: "חשבון Google Ads",
    },
  ]);
  expect(adAccountShortcutLabel(links[0], 1)).toBe("פתח חשבון מודעות");
  expect(adAccountShortcutLabel(links[0], 2)).toBe("חשבון Facebook");
});

test("reports without an ads account have no shortcut", () => {
  expect(
    getAdAccountUrl({
      integration_type: "google_analytics",
      integration_settings: {},
    }),
  ).toBe(null);
  expect(
    getAdAccountUrl({
      integration_type: "facebook_insights",
      integration_settings: {},
    }),
  ).toBe(null);
});
