import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  FB_ADSET_FIELDS,
  buildDestinationTypeMaps,
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
