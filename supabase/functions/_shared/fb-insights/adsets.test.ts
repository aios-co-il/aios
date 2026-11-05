import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  FB_ADSET_FIELDS,
  buildDestinationTypeMaps,
  fetchAdsets,
  resolveDestinationType,
} from "./adsets.ts";

Deno.test("FB_ADSET_FIELDS asks for the ad set's destination", () => {
  assertStringIncludes(FB_ADSET_FIELDS, "destination_type");
  assertStringIncludes(FB_ADSET_FIELDS, "promoted_object");
});

Deno.test("buildDestinationTypeMaps", async (t) => {
  const maps = buildDestinationTypeMaps([
    { id: "a1", campaign_id: "c1", destination_type: "instagram_profile" },
    { id: "a2", campaign_id: "c1", destination_type: "INSTAGRAM_PROFILE" },
    { id: "a3", campaign_id: "c1", destination_type: "WEBSITE" },
    { id: "a4", campaign_id: "c2", destination_type: null },
  ]);

  await t.step("keeps each ad set's own destination", () => {
    assertEquals(maps.byAdset, {
      a1: "INSTAGRAM_PROFILE",
      a2: "INSTAGRAM_PROFILE",
      a3: "WEBSITE",
    });
  });

  await t.step("gives the campaign its most common destination", () => {
    assertEquals(maps.byCampaign, { c1: "INSTAGRAM_PROFILE" });
  });

  await t.step(
    "an ad set row uses its ad set, a campaign row its campaign",
    () => {
      assertEquals(
        resolveDestinationType({ campaign_id: "c1", adset_id: "a3" }, maps),
        "WEBSITE",
      );
      assertEquals(
        resolveDestinationType({ campaign_id: "c1" }, maps),
        "INSTAGRAM_PROFILE",
      );
      assertEquals(resolveDestinationType({ campaign_id: "c2" }, maps), null);
    },
  );
});

Deno.test("fetchAdsets", async (t) => {
  const firstPage = {
    data: [{ id: "a1", campaign_id: "c1", destination_type: "WEBSITE" }],
    paging: { next: "https://graph.facebook.com/v21.0/next-page" },
  };

  await t.step("follows paging and asks for every ad set field", async () => {
    const graph = fakeGraph(firstPage, {
      data: [{ id: "a2", campaign_id: "c1" }],
    });
    const adsets = await fetchAdsets("act_1", "token", "test", graph.fetchPage);
    assertEquals(
      adsets.map((adset) => adset.id),
      ["a1", "a2"],
    );
    assertStringIncludes(
      graph.urls[0],
      `/act_1/adsets?fields=${FB_ADSET_FIELDS}&`,
    );
    assertEquals(graph.urls[1], firstPage.paging.next);
  });

  await t.step(
    "a Graph error ends the read with a log, not silently",
    async () => {
      const graph = fakeGraph(firstPage, {
        error: { message: "Rate limit reached" },
      });
      const logged: unknown[][] = [];
      const realError = console.error;
      console.error = (...args: unknown[]) => {
        logged.push(args);
      };
      try {
        const adsets = await fetchAdsets(
          "act_1",
          "token",
          "sync-facebook-insights",
          graph.fetchPage,
        );
        assertEquals(
          adsets.map((adset) => adset.id),
          ["a1"],
        );
      } finally {
        console.error = realError;
      }
      assertEquals(logged, [
        [
          "[sync-facebook-insights] ad sets fetch failed:",
          "Rate limit reached",
        ],
      ]);
    },
  );
});

/** A Graph API stand-in that answers each request with the next page. */
function fakeGraph(...pages: unknown[]) {
  const urls: string[] = [];
  const fetchPage = (input: RequestInfo | URL) => {
    urls.push(String(input));
    return Promise.resolve(Response.json(pages[urls.length - 1]));
  };
  return { urls, fetchPage };
}
