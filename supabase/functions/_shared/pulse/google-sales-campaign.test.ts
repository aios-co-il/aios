import { assertStrictEquals } from "jsr:@std/assert@1";
import { isConfirmedGoogleSalesCampaign } from "./google-sales-campaign.ts";

const google = { integration_type: "google_ads" };

Deno.test("isConfirmedGoogleSalesCampaign", async (t) => {
  await t.step("the campaign's own goal or a mapping confirms it", () => {
    for (const source of ["platform_goal", "explicit_mapping"]) {
      assertStrictEquals(
        isConfirmedGoogleSalesCampaign(
          { classification_source: source },
          google,
        ),
        true,
      );
    }
  });

  await t.step("the report type or another platform does not", () => {
    assertStrictEquals(
      isConfirmedGoogleSalesCampaign(
        { classification_source: "table_report_type" },
        google,
      ),
      false,
    );
    assertStrictEquals(isConfirmedGoogleSalesCampaign({}, google), false);
    assertStrictEquals(
      isConfirmedGoogleSalesCampaign(
        { classification_source: "platform_goal" },
        { integration_type: "facebook_insights" },
      ),
      false,
    );
  });
});
