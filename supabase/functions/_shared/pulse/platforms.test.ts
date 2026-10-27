import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  PULSE_AD_INTEGRATION_TYPES,
  isPulsePlatform,
  pulsePlatformName,
  pulsePlatformOf,
} from "./platforms.ts";

Deno.test("report tables map to their ad platform", () => {
  assertStrictEquals(pulsePlatformOf("google_ads"), "google");
  assertStrictEquals(pulsePlatformOf("facebook_insights"), "meta");
  assertStrictEquals(pulsePlatformOf("facebook_ecommerce"), "meta");
  assertStrictEquals(pulsePlatformOf("leads_form"), null);
  assertStrictEquals(pulsePlatformOf(null), null);
  assertEquals(
    [...PULSE_AD_INTEGRATION_TYPES],
    ["facebook_insights", "facebook_ecommerce", "google_ads"],
  );
});

Deno.test("platforms are named as the pulse shows them", () => {
  assertStrictEquals(pulsePlatformName("meta"), "Meta");
  assertStrictEquals(pulsePlatformName("google"), "Google Ads");
  assertStrictEquals(isPulsePlatform("meta"), true);
  assertStrictEquals(isPulsePlatform("tiktok"), false);
});
