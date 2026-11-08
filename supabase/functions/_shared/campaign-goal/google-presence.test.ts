import { assertStrictEquals } from "jsr:@std/assert@1";
import { googleReportFallbackGoal } from "./google-presence.ts";

Deno.test("googleReportFallbackGoal", async (t) => {
  await t.step("a Google table set to ecommerce falls back to sales", () => {
    assertStrictEquals(
      googleReportFallbackGoal([
        {
          integration_type: "google_ads",
          integration_settings: { campaign_type: "ecommerce" },
        },
      ]),
      "ecommerce",
    );
  });

  await t.step(
    "a Google table in the איקומרס category falls back to sales, as the pulse counts it (AIO-494)",
    () => {
      assertStrictEquals(
        googleReportFallbackGoal([
          {
            integration_type: "google_ads",
            integration_settings: {},
            category: "איקומרס",
          },
        ]),
        "ecommerce",
      );
    },
  );

  await t.step("any other table falls back to leads", () => {
    assertStrictEquals(
      googleReportFallbackGoal([
        { integration_type: "facebook_ecommerce", integration_settings: {} },
        { integration_type: "google_ads", integration_settings: {} },
      ]),
      "leads",
    );
  });
});
