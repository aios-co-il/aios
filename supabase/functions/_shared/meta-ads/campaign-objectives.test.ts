import { assertStrictEquals } from "jsr:@std/assert@1";
import { metaObjectiveGoal } from "./campaign-objectives.ts";

Deno.test("metaObjectiveGoal", async (t) => {
  await t.step("every sales objective is a sales goal", () => {
    for (const objective of [
      "OUTCOME_SALES",
      "PRODUCT_CATALOG_SALES",
      "CATALOG_SALES",
      "SALES",
    ]) {
      assertStrictEquals(metaObjectiveGoal(objective), "ecommerce");
    }
  });

  await t.step("every lead objective is a lead goal", () => {
    assertStrictEquals(metaObjectiveGoal("OUTCOME_LEADS"), "leads");
    assertStrictEquals(metaObjectiveGoal("LEAD_GENERATION"), "leads");
  });

  await t.step("case and spaces do not matter", () => {
    assertStrictEquals(metaObjectiveGoal(" outcome_sales "), "ecommerce");
  });

  await t.step("CONVERSIONS and other objectives leave the goal open", () => {
    for (const objective of ["CONVERSIONS", "OUTCOME_TRAFFIC", "", null]) {
      assertStrictEquals(metaObjectiveGoal(objective), null);
    }
  });
});
