import assert from "node:assert/strict";
import test from "node:test";
import { adAccountShortcutLabel, getAdAccountLinks, getAdAccountUrl } from "./adAccountUrl.ts";

test("facebook insights opens Ads Manager with the account id", () => {
  assert.equal(
    getAdAccountUrl({
      integration_type: "facebook_insights",
      integration_settings: { ad_account_id: "act_120245824650190459" },
    }),
    "https://business.facebook.com/adsmanager/manage/campaigns?act=120245824650190459",
  );
});

test("google ads opens the customer overview", () => {
  assert.equal(
    getAdAccountUrl({
      integration_type: "google_ads",
      integration_settings: { customer_id: "123-456-7890" },
    }),
    "https://ads.google.com/aw/overview?__e=1234567890",
  );
});

test("a dashboard collects one shortcut per ads account", () => {
  const links = getAdAccountLinks([
    { integration_type: "google_analytics", integration_settings: {} },
    { integration_type: "facebook_insights", integration_settings: { ad_account_id: "act_111" } },
    { integration_type: "facebook_ecommerce", integration_settings: { ad_account_id: "111" } },
    { integration_type: "google_ads", integration_settings: { customer_id: "123-456-7890" } },
  ]);
  assert.deepEqual(links, [
    { url: "https://business.facebook.com/adsmanager/manage/campaigns?act=111", label: "חשבון Facebook" },
    { url: "https://ads.google.com/aw/overview?__e=1234567890", label: "חשבון Google Ads" },
  ]);
  assert.equal(adAccountShortcutLabel(links[0], 1), "פתח חשבון מודעות");
  assert.equal(adAccountShortcutLabel(links[0], 2), "חשבון Facebook");
});

test("reports without an ads account have no shortcut", () => {
  assert.equal(
    getAdAccountUrl({ integration_type: "google_analytics", integration_settings: {} }),
    null,
  );
  assert.equal(
    getAdAccountUrl({ integration_type: "facebook_insights", integration_settings: {} }),
    null,
  );
});
