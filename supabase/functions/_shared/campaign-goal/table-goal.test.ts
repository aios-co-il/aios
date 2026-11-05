import { assertStrictEquals } from "jsr:@std/assert@1";
import { isEcommerceReportTable, reportTableGoal } from "./table-goal.ts";

Deno.test("reportTableGoal is a report table's own goal", async (t) => {
  await t.step("an ecommerce report table is ecommerce", () => {
    for (const table of [
      { integration_type: "facebook_ecommerce" },
      { integration_type: "facebook_insights", category: "איקומרס" },
      {
        integration_type: "google_ads",
        integration_settings: { campaign_type: "ecommerce" },
      },
    ]) {
      assertStrictEquals(isEcommerceReportTable(table), true);
      assertStrictEquals(reportTableGoal(table), "ecommerce");
    }
  });

  await t.step("any other Meta or Google Ads table is leads", () => {
    assertStrictEquals(
      reportTableGoal({ integration_type: "facebook_insights" }),
      "leads",
    );
    assertStrictEquals(
      reportTableGoal({
        integration_type: "facebook_insights",
        integration_settings: { campaign_type: "leads" },
      }),
      "leads",
    );
    assertStrictEquals(
      reportTableGoal({ integration_type: "google_ads" }),
      "leads",
    );
  });

  await t.step("a table without ad campaigns has no goal", () => {
    assertStrictEquals(reportTableGoal({ integration_type: "manual" }), null);
    assertStrictEquals(reportTableGoal({}), null);
  });
});
