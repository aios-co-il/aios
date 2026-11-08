import { expect, test } from "vitest";
import {
  adAccountShortcutLabel,
  isAdAccountLink,
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

const googleTable = {
  integration_type: "google_ads",
  integration_settings: { customer_id: "192-164-0837" },
};
const metaTable = {
  integration_type: "facebook_insights",
  integration_settings: { ad_account_id: "act_123" },
};

test("a saved client link wins over the one built from the account id over the one built from the account id", () => {
  const links = {
    google_ads_url: "https://ads.google.com/aw/overview?ocid=42",
    meta_ads_url: "https://adsmanager.facebook.com/x",
  };
  expect(getAdAccountUrl(googleTable, links)).toBe(links.google_ads_url);
  expect(getAdAccountUrl(metaTable, links)).toBe(links.meta_ads_url);
});

test("the built link stays when nothing is saved when nothing is saved", () => {
  expect(getAdAccountUrl(googleTable, { google_ads_url: null })).toBe(
    "https://ads.google.com/aw/overview?__e=1921640837",
  );
});

test("a saved link must be https on that platform's own host", () => {
  expect(
    isAdAccountLink(
      "google_ads_url",
      "https://ads.google.com/aw/overview?ocid=1",
    ),
  ).toBe(true);
  expect(
    isAdAccountLink(
      "google_ads_url",
      "https://ads.google.com@attacker.example/",
    ),
  ).toBe(false);
  expect(
    isAdAccountLink("google_ads_url", "https://business.facebook.com/x"),
  ).toBe(false);
  expect(
    isAdAccountLink("meta_ads_url", "http://business.facebook.com/x"),
  ).toBe(false);
  expect(
    isAdAccountLink(
      "meta_ads_url",
      "https://adsmanager.facebook.com/adsmanager",
    ),
  ).toBe(true);
});

test("a saved link to the wrong host falls back to the built link", () => {
  expect(
    getAdAccountUrl(
      {
        integration_type: "google_ads",
        integration_settings: { customer_id: "192-164-0837" },
      },
      { google_ads_url: "https://attacker.example/aw" },
    ),
  ).toBe("https://ads.google.com/aw/overview?__e=1921640837");
});
