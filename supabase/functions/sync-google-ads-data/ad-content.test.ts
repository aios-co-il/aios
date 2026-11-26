import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  AD_CONTENT_GAQL_FIELDS,
  googleAdContent,
  storedGoogleAdContent,
} from "./ad-content.ts";

Deno.test("googleAdContent", async (t) => {
  await t.step("reads a responsive search ad's copy", () => {
    const content = googleAdContent({
      type: "RESPONSIVE_SEARCH_AD",
      finalUrls: ["https://shop.example.com/sale", "https://other.example"],
      responsiveSearchAd: {
        headlines: [
          { text: "Shoes on sale", pinnedField: "HEADLINE_1" },
          { text: " Free shipping " },
          { text: "" },
          { pinnedField: "HEADLINE_3" },
        ],
        descriptions: [{ text: "Buy today." }, { text: "Easy returns." }],
        path1: "shoes",
        path2: "sale",
      },
    });

    assertEquals(content, {
      ad_type: "RESPONSIVE_SEARCH_AD",
      ad_headlines: ["Shoes on sale", "Free shipping"],
      ad_descriptions: ["Buy today.", "Easy returns."],
      ad_final_url: "https://shop.example.com/sale",
      ad_display_path: "shoes/sale",
    });
  });

  await t.step("reads an expanded text ad's parts", () => {
    const content = googleAdContent({
      type: "EXPANDED_TEXT_AD",
      expandedTextAd: {
        headlinePart1: "One",
        headlinePart2: "Two",
        description: "Desc",
        path1: "p",
      },
    });

    assertEquals(content, {
      ad_type: "EXPANDED_TEXT_AD",
      ad_headlines: ["One", "Two"],
      ad_descriptions: ["Desc"],
      ad_display_path: "p",
    });
  });

  await t.step("keeps a video ad's type and headlines", () => {
    const content = googleAdContent({
      type: "VIDEO_RESPONSIVE_AD",
      finalUrls: ["https://example.com"],
      videoResponsiveAd: { headlines: [{ text: "Watch" }] },
    });

    assertEquals(content, {
      ad_type: "VIDEO_RESPONSIVE_AD",
      ad_headlines: ["Watch"],
      ad_final_url: "https://example.com",
    });
  });

  await t.step("stores nothing when Google returned no copy", () => {
    assertEquals(googleAdContent(undefined), {});
    assertEquals(googleAdContent({ finalUrls: "not-a-list" }), {});
    assertEquals(
      googleAdContent({ responsiveSearchAd: { headlines: "x" } }),
      {},
    );
  });
});

Deno.test("storedGoogleAdContent", async (t) => {
  await t.step("reads the stored fields of an ad row", () => {
    const content = storedGoogleAdContent({
      entity_level: "ad",
      ad_type: "RESPONSIVE_SEARCH_AD",
      ad_headlines: ["A", 3, " B "],
      ad_descriptions: ["D"],
      ad_final_url: "https://example.com",
    });

    assertEquals(content, {
      ad_type: "RESPONSIVE_SEARCH_AD",
      ad_headlines: ["A", "B"],
      ad_descriptions: ["D"],
      ad_final_url: "https://example.com",
    });
  });

  await t.step("is null for a row synced before content was stored", () => {
    assertStrictEquals(
      storedGoogleAdContent({ entity_level: "ad", ad_id: "1" }),
      null,
    );
    assertStrictEquals(storedGoogleAdContent(null), null);
  });

  await t.step("is null for an ad with a type but no copy", () => {
    assertStrictEquals(
      storedGoogleAdContent({
        entity_level: "ad",
        ad_type: "SHOPPING_PRODUCT_AD",
        ad_final_url: "https://example.com",
      }),
      null,
    );
  });

  await t.step("reads an ad with descriptions but no headlines", () => {
    assertEquals(storedGoogleAdContent({ ad_descriptions: ["D"] }), {
      ad_descriptions: ["D"],
    });
  });
});

Deno.test("the ad query selects each card field from ad_group_ad", () => {
  const fields = AD_CONTENT_GAQL_FIELDS.split(",").map((field) => field.trim());

  for (const field of fields) {
    assertStrictEquals(field.startsWith("ad_group_ad.ad."), true, field);
  }
  assertStrictEquals(fields.includes("ad_group_ad.ad.type"), true);
  assertStrictEquals(
    fields.includes("ad_group_ad.ad.responsive_search_ad.headlines"),
    true,
  );
});
