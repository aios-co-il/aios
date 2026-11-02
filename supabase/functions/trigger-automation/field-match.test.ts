import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  fieldValueContains,
  fieldValueEquals,
  fieldValueStartsWith,
  sourceBranch,
} from "./field-match.ts";

Deno.test("a source condition on paid_ads holds for a lead sent as FB", () => {
  assertStrictEquals(fieldValueEquals("source", "FB", "paid_ads"), true);
  assertStrictEquals(fieldValueEquals("first_source", "פייסבוק", "FB"), true);
  assertStrictEquals(fieldValueEquals("source", "FB", "website"), false);
});

Deno.test("other fields still compare the exact text", () => {
  assertStrictEquals(fieldValueEquals("status", "FB", "paid_ads"), false);
  assertStrictEquals(fieldValueEquals("status", "new", "new"), true);
});

Deno.test("source contains / starts with read the text and its key", () => {
  assertStrictEquals(fieldValueContains("source", "FB", "paid_ads"), true);
  assertStrictEquals(fieldValueContains("source", "FB", "PAID"), true);
  assertStrictEquals(
    fieldValueContains("first_source", "Facebook Ads", "book"),
    true,
  );
  assertStrictEquals(fieldValueContains("source", "FB", "website"), false);
  assertStrictEquals(fieldValueStartsWith("source", "FB", "paid"), true);
  assertStrictEquals(fieldValueStartsWith("source", "FB", "F"), true);
  assertStrictEquals(fieldValueStartsWith("source", "FB", "web"), false);
});

Deno.test("a source stored as its key contains its card label", () => {
  // Leads from before the source was kept as sent store "paid_ads"; the card
  // shows "FB", and `equals FB` already holds for them.
  assertStrictEquals(fieldValueEquals("source", "paid_ads", "FB"), true);
  assertStrictEquals(fieldValueContains("source", "paid_ads", "FB"), true);
  assertStrictEquals(fieldValueStartsWith("source", "paid_ads", "FB"), true);
  assertStrictEquals(fieldValueContains("source", "Facebook Ads", "FB"), true);
  assertStrictEquals(fieldValueContains("source", "website", "אתר"), true);
  assertStrictEquals(fieldValueContains("source", "website", "FB"), false);
});

Deno.test("only an empty or named-other source reads as other", () => {
  assertStrictEquals(fieldValueContains("source", "Promo X", "her"), false);
  assertStrictEquals(fieldValueStartsWith("source", "Promo X", "oth"), false);
  assertStrictEquals(fieldValueContains("source", "Promo X", "promo"), true);
  assertStrictEquals(fieldValueContains("source", "other", "her"), true);
  assertStrictEquals(fieldValueContains("source", "אחר", "other"), true);
  assertStrictEquals(fieldValueContains("source", "", "אחר"), true);
});

Deno.test("other fields contain / start with the exact text only", () => {
  assertStrictEquals(fieldValueContains("status", "FB", "paid_ads"), false);
  assertStrictEquals(fieldValueContains("status", "New Lead", "lead"), true);
  assertStrictEquals(fieldValueStartsWith("status", "FB", "paid"), false);
  assertStrictEquals(fieldValueStartsWith("status", "new", "N"), false);
});

Deno.test("a switch on source picks the branch naming the same source", () => {
  const branches = ["paid_ads", "website", "ברירת מחדל"];
  assertStrictEquals(
    sourceBranch("source", "Facebook Ads", branches),
    "paid_ads",
  );
  assertStrictEquals(sourceBranch("source", "Promo X", branches), undefined);
  assertStrictEquals(
    sourceBranch("status", "Facebook Ads", branches),
    undefined,
  );
});
