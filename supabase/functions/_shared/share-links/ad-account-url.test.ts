import { assertEquals } from "jsr:@std/assert@1";
import {
  adAccountPlatform,
  getAdAccountUrl,
  isAdAccountLink,
  toClientAdLinks,
} from "./ad-account-url.ts";

Deno.test("a saved link must be https on its platform's own host", () => {
  assertEquals(
    isAdAccountLink("meta_ads_url", "https://adsmanager.facebook.com/x"),
    true,
  );
  assertEquals(
    isAdAccountLink("meta_ads_url", "https://ads.google.com/aw"),
    false,
  );
  assertEquals(
    isAdAccountLink("google_ads_url", "http://ads.google.com/aw"),
    false,
  );
  assertEquals(
    isAdAccountLink("google_ads_url", "https://user:pw@ads.google.com/aw"),
    false,
  );
  assertEquals(isAdAccountLink("google_ads_url", "not a url"), false);
  assertEquals(isAdAccountLink("google_ads_url", null), false);
});

Deno.test("toClientAdLinks drops every link that fails the host check", () => {
  assertEquals(
    toClientAdLinks({
      google_ads_url: "https://attacker.example/aw",
      meta_ads_url: "https://business.facebook.com/adsmanager?act=9",
    }),
    {
      google_ads_url: null,
      meta_ads_url: "https://business.facebook.com/adsmanager?act=9",
    },
  );
  assertEquals(toClientAdLinks(null), {
    google_ads_url: null,
    meta_ads_url: null,
  });
});

Deno.test("adAccountPlatform maps only ads integrations", () => {
  assertEquals(adAccountPlatform("facebook_ecommerce"), "meta");
  assertEquals(adAccountPlatform("google_ads"), "google");
  assertEquals(adAccountPlatform("google_analytics"), null);
  assertEquals(adAccountPlatform(null), null);
});

Deno.test("getAdAccountUrl builds the account link from its id", () => {
  assertEquals(
    getAdAccountUrl({
      integration_type: "facebook_insights",
      integration_settings: { ad_account_id: "act_111" },
    }),
    "https://business.facebook.com/adsmanager/manage/campaigns?act=111",
  );
  assertEquals(
    getAdAccountUrl({
      integration_type: "google_ads",
      integration_settings: { customer_id: "123-456-7890" },
    }),
    "https://ads.google.com/aw/overview?__e=1234567890",
  );
});

Deno.test(
  "getAdAccountUrl prefers a valid saved link and ignores others",
  () => {
    const table = {
      integration_type: "google_ads",
      integration_settings: { customer_id: "1234567890" },
    };

    assertEquals(
      getAdAccountUrl(table, {
        google_ads_url: "https://ads.google.com/aw/overview?ocid=42",
      }),
      "https://ads.google.com/aw/overview?ocid=42",
    );
    assertEquals(
      getAdAccountUrl(table, { google_ads_url: "https://attacker.example/aw" }),
      "https://ads.google.com/aw/overview?__e=1234567890",
    );
  },
);

Deno.test(
  "getAdAccountUrl is null without a table, an ads type or an id",
  () => {
    assertEquals(getAdAccountUrl(null), null);
    assertEquals(
      getAdAccountUrl({ integration_type: "google_analytics" }),
      null,
    );
    assertEquals(
      getAdAccountUrl({ integration_type: "facebook_insights" }),
      null,
    );
  },
);
