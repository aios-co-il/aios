import { assertEquals } from "jsr:@std/assert@1";
import { dashboardAdAccountLinks } from "./dashboard-ad-account-links.ts";

const TENANT_ID = "aaaaaaaa-0000-4000-8000-000000000001";

const OTHER_TENANT_ID = "bbbbbbbb-0000-4000-8000-000000000002";

const GOOGLE_URL = "https://ads.google.com/aw/overview?__e=1234567890";

const SAVED_META_URL = "https://business.facebook.com/adsmanager?act=9";

const SAVED_GOOGLE_URL = "https://ads.google.com/aw/overview?ocid=42";

const ownGoogleTable = {
  tenant_id: TENANT_ID,
  integration_type: "google_ads",
  integration_settings: { customer_id: "1234567890" },
};

const foreignMetaTable = {
  tenant_id: OTHER_TENANT_ID,
  integration_type: "facebook_insights",
  integration_settings: { ad_account_id: "act_666" },
};

Deno.test("links only the dashboard tenant's tables", () => {
  const links = dashboardAdAccountLinks({ tenant_id: TENANT_ID }, [
    ownGoogleTable,
    foreignMetaTable,
  ]);

  assertEquals(links, [
    { url: GOOGLE_URL, platform: "google", label: "חשבון Google Ads" },
  ]);
});

Deno.test(
  "uses the client's saved links when the client is in the tenant",
  () => {
    const ownMetaTable = { ...foreignMetaTable, tenant_id: TENANT_ID };

    const links = dashboardAdAccountLinks(
      {
        tenant_id: TENANT_ID,
        clients: { tenant_id: TENANT_ID, meta_ads_url: SAVED_META_URL },
      },
      [ownMetaTable],
    );

    assertEquals(links, [
      { url: SAVED_META_URL, platform: "meta", label: "חשבון Facebook" },
    ]);
  },
);

Deno.test("ignores a foreign client's saved links", () => {
  const links = dashboardAdAccountLinks(
    {
      tenant_id: TENANT_ID,
      clients: { tenant_id: OTHER_TENANT_ID, google_ads_url: SAVED_GOOGLE_URL },
    },
    [ownGoogleTable],
  );

  assertEquals(links, [
    { url: GOOGLE_URL, platform: "google", label: "חשבון Google Ads" },
  ]);
});

Deno.test("a dashboard without a tenant links nothing", () => {
  assertEquals(dashboardAdAccountLinks({}, [ownGoogleTable]), []);
});
