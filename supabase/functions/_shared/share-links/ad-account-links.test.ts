import { assertEquals } from "jsr:@std/assert@1";
import {
  adAccountShortcutLabel,
  getAdAccountLinks,
  getTableAdAccountLinks,
} from "./ad-account-links.ts";
import { toClientAdLinks } from "./ad-account-url.ts";

const META_URL =
  "https://business.facebook.com/adsmanager/manage/campaigns?act=111";

const GOOGLE_URL = "https://ads.google.com/aw/overview?__e=1234567890";

const metaTable = {
  integration_type: "facebook_insights",
  integration_settings: { ad_account_id: "act_111" },
};

const googleTable = {
  integration_type: "google_ads",
  integration_settings: { customer_id: "123-456-7890" },
};

const gaTable = { integration_type: "google_analytics" };

Deno.test("an ads report links its own account", () => {
  assertEquals(getTableAdAccountLinks(metaTable, [googleTable]), [
    { url: META_URL, platform: "meta", label: "פתח חשבון מודעות" },
  ]);
});

Deno.test("a non-ads report links the client's ads accounts", () => {
  assertEquals(getTableAdAccountLinks(gaTable, [metaTable, googleTable]), [
    { url: META_URL, platform: "meta", label: "חשבון Facebook" },
    { url: GOOGLE_URL, platform: "google", label: "חשבון Google Ads" },
  ]);
});

Deno.test("a dashboard links each account once", () => {
  const links = getAdAccountLinks([
    gaTable,
    metaTable,
    { ...metaTable, integration_type: "facebook_ecommerce" },
    googleTable,
  ]);

  assertEquals(
    links.map((link) => link.url),
    [META_URL, GOOGLE_URL],
  );
  assertEquals(adAccountShortcutLabel(links[0], 1), "פתח חשבון מודעות");
  assertEquals(adAccountShortcutLabel(links[0], 2), "חשבון Facebook");
});

Deno.test("a saved client link wins over the built one", () => {
  const saved = "https://ads.google.com/aw/overview?ocid=42";

  assertEquals(
    getTableAdAccountLinks(googleTable, [], { google_ads_url: saved }),
    [{ url: saved, platform: "google", label: "פתח חשבון מודעות" }],
  );
});

Deno.test("saved client links off their platform's site are dropped", () => {
  assertEquals(
    toClientAdLinks({
      google_ads_url: "https://ads.google.com@attacker.example/",
      meta_ads_url: "javascript:alert(1)",
    }),
    { google_ads_url: null, meta_ads_url: null },
  );
  assertEquals(
    toClientAdLinks({
      google_ads_url: "https://ads.google.com/aw/overview?ocid=1",
      meta_ads_url: "https://adsmanager.facebook.com/x",
    }),
    {
      google_ads_url: "https://ads.google.com/aw/overview?ocid=1",
      meta_ads_url: "https://adsmanager.facebook.com/x",
    },
  );
  assertEquals(toClientAdLinks(null), {
    google_ads_url: null,
    meta_ads_url: null,
  });
});

Deno.test("tables without an account id give no link", () => {
  assertEquals(
    getTableAdAccountLinks({ integration_type: "facebook_insights" }, [
      gaTable,
    ]),
    [],
  );
});
