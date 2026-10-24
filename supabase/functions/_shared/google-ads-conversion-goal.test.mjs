import assert from "node:assert/strict";
import test from "node:test";

import {
  conversionCategorySide,
  googleCampaignConversionGoal,
} from "./google-ads-conversion-goal.mjs";

test("conversion categories map to a pulse side", () => {
  assert.equal(conversionCategorySide("PURCHASE"), "ecommerce");
  assert.equal(conversionCategorySide("SUBMIT_LEAD_FORM"), "leads");
  assert.equal(conversionCategorySide("PHONE_CALL_LEAD"), "leads");
  assert.equal(conversionCategorySide("PAGE_VIEW"), null);
  assert.equal(conversionCategorySide("ADD_TO_CART"), null);
});

test("bidding on one side decides even with no conversions", () => {
  assert.equal(
    googleCampaignConversionGoal({ biddableCategories: ["PURCHASE"] }),
    "ecommerce",
  );
  assert.equal(
    googleCampaignConversionGoal({
      biddableCategories: ["SUBMIT_LEAD_FORM", "CONTACT", "PAGE_VIEW"],
      purchaseConversions: 4,
    }),
    "leads",
  );
});

test("bidding on both sides lets actual conversions decide", () => {
  const biddableCategories = ["PURCHASE", "SUBMIT_LEAD_FORM"];
  assert.equal(
    googleCampaignConversionGoal({
      biddableCategories,
      purchaseConversions: 5,
      leadConversions: 1,
    }),
    "ecommerce",
  );
  assert.equal(
    googleCampaignConversionGoal({
      biddableCategories,
      purchaseConversions: 1,
      leadConversions: 5,
    }),
    "leads",
  );
  assert.equal(googleCampaignConversionGoal({ biddableCategories }), null);
});

test("no goals and no conversions leaves the campaign to the report type", () => {
  assert.equal(googleCampaignConversionGoal({}), null);
});
