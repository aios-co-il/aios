import { assertStrictEquals } from "jsr:@std/assert@1";
import { fieldValueEquals, sourceBranch } from "./field-match.ts";

Deno.test("a source condition on paid_ads holds for a lead sent as FB", () => {
  assertStrictEquals(fieldValueEquals("source", "FB", "paid_ads"), true);
  assertStrictEquals(fieldValueEquals("first_source", "פייסבוק", "FB"), true);
  assertStrictEquals(fieldValueEquals("source", "FB", "website"), false);
});

Deno.test("other fields still compare the exact text", () => {
  assertStrictEquals(fieldValueEquals("status", "FB", "paid_ads"), false);
  assertStrictEquals(fieldValueEquals("status", "new", "new"), true);
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
