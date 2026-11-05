import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  conversionCategorySide,
  googleCampaignConversionGoal,
} from "./conversion-goal.ts";

Deno.test("conversion categories map to a pulse side", () => {
  assertStrictEquals(conversionCategorySide("PURCHASE"), "ecommerce");
  assertStrictEquals(conversionCategorySide("SUBMIT_LEAD_FORM"), "leads");
  assertStrictEquals(conversionCategorySide("PHONE_CALL_LEAD"), "leads");
  assertStrictEquals(conversionCategorySide("PAGE_VIEW"), null);
  assertStrictEquals(conversionCategorySide("ADD_TO_CART"), null);
});

Deno.test("bidding on one side decides even with no conversions", () => {
  assertStrictEquals(
    googleCampaignConversionGoal({ biddableCategories: ["PURCHASE"] }),
    "ecommerce",
  );
  assertStrictEquals(
    googleCampaignConversionGoal({
      biddableCategories: ["SUBMIT_LEAD_FORM", "CONTACT", "PAGE_VIEW"],
      purchaseConversions: 4,
    }),
    "leads",
  );
});

Deno.test("bidding on both sides lets actual conversions decide", () => {
  const biddableCategories = ["PURCHASE", "SUBMIT_LEAD_FORM"];
  assertStrictEquals(
    googleCampaignConversionGoal({
      biddableCategories,
      purchaseConversions: 5,
      leadConversions: 1,
    }),
    "ecommerce",
  );
  assertStrictEquals(
    googleCampaignConversionGoal({
      biddableCategories,
      purchaseConversions: 1,
      leadConversions: 5,
    }),
    "leads",
  );
  assertStrictEquals(
    googleCampaignConversionGoal({ biddableCategories }),
    null,
  );
});

Deno.test(
  "no goals and no conversions leaves the campaign to the report type",
  () => {
    assertStrictEquals(googleCampaignConversionGoal({}), null);
  },
);
