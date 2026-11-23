import { assertEquals } from "jsr:@std/assert@1";
import {
  siteTrackingOf,
  siteWithTracking,
  TRACKING_ID_PATTERNS,
} from "./site-tracking.ts";

const site = {
  name: "Exsitu",
  tenantId: "t-1",
  clientId: "c-1",
  tracking: { gtmId: "GTM-NVKZTXH3" },
  leads: { destination: "webhook" },
};

Deno.test("a site row's tracking leaves out the ids that are not set", () => {
  assertEquals(
    siteTrackingOf({ gtm_id: "GTM-NVKZTXH3", ga4_id: null, meta_pixel_id: "" }),
    { gtmId: "GTM-NVKZTXH3" },
  );
});

Deno.test("the same tracking in another key order changes nothing", () => {
  const ordered = {
    ...site,
    tracking: { ga4Id: "G-ABC1234", gtmId: "GTM-NVKZTXH3" },
  };
  assertEquals(
    siteWithTracking(ordered, { gtmId: "GTM-NVKZTXH3", ga4Id: "G-ABC1234" }),
    null,
  );
  assertEquals(siteWithTracking({ name: "Acme" }, { gtmId: " " }), null);
});

Deno.test("new tracking replaces only the tracking, in its place", () => {
  const updated = siteWithTracking(site, { ga4Id: "G-ABC1234" });
  assertEquals(updated, { ...site, tracking: { ga4Id: "G-ABC1234" } });
  assertEquals(Object.keys(updated ?? {}), Object.keys(site));
});

Deno.test("no ids at all drops the tracking key", () => {
  assertEquals(siteWithTracking(site, {}), {
    name: "Exsitu",
    tenantId: "t-1",
    clientId: "c-1",
    leads: { destination: "webhook" },
  });
});

Deno.test("the id patterns match the landing-pages app's formats", () => {
  assertEquals(TRACKING_ID_PATTERNS.gtmId.test("GTM-NVKZTXH3"), true);
  assertEquals(TRACKING_ID_PATTERNS.gtmId.test("gtm-nvkztxh3"), false);
  assertEquals(TRACKING_ID_PATTERNS.ga4Id.test("G-ABC1234"), true);
  assertEquals(TRACKING_ID_PATTERNS.ga4Id.test("G-ABC"), false);
  assertEquals(TRACKING_ID_PATTERNS.metaPixelId.test("1234567890"), true);
  assertEquals(TRACKING_ID_PATTERNS.metaPixelId.test("12345"), false);
});
