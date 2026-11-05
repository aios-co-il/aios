import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  extractAccountIdFromReportTable,
  metaAdAccountsEqual,
  normalizeGoogleCustomerId,
  normalizeMetaAdAccountId,
  parseMetaAdAccountIdInput,
  validateMetaAdPlatform,
  validateReportTableAccountId,
} from "./client-report-sync.mjs";

Deno.test("normalizeGoogleCustomerId strips dashes", () => {
  assertStrictEquals(normalizeGoogleCustomerId("538-568-6491"), "5385686491");
  assertStrictEquals(normalizeGoogleCustomerId("5385686491"), "5385686491");
  assertStrictEquals(normalizeGoogleCustomerId(""), null);
});

Deno.test("normalizeMetaAdAccountId ensures act_ prefix", () => {
  assertStrictEquals(
    normalizeMetaAdAccountId("651825899520164"),
    "act_651825899520164",
  );
  assertStrictEquals(
    normalizeMetaAdAccountId("act_651825899520164"),
    "act_651825899520164",
  );
});

Deno.test(
  "extractAccountIdFromReportTable reads google_ads customer_id",
  () => {
    assertStrictEquals(
      extractAccountIdFromReportTable("google_ads", {
        customer_id: "538-568-6491",
      }),
      "5385686491",
    );
  },
);

Deno.test(
  "extractAccountIdFromReportTable reads facebook ad_account_id",
  () => {
    assertStrictEquals(
      extractAccountIdFromReportTable("facebook_insights", {
        ad_account_id: "act_651825899520164",
      }),
      "act_651825899520164",
    );
  },
);

Deno.test("validateReportTableAccountId flags missing google account", () => {
  const v = validateReportTableAccountId(
    "google_ads",
    {},
    { clientId: "c1", tableId: "t1" },
  );
  assertStrictEquals(v.ok, false);
  assertStrictEquals(v.reason, "missing_account_id");
});

Deno.test("validateReportTableAccountId passes with account id", () => {
  const v = validateReportTableAccountId("google_ads", { customer_id: "123" });
  assertStrictEquals(v.ok, true);
  assertStrictEquals(v.accountId, "123");
});

Deno.test("parseMetaAdAccountIdInput accepts act_ prefix and digits", () => {
  const withPrefix = parseMetaAdAccountIdInput("act_561430705400571");
  assertStrictEquals(withPrefix.ok, true);
  assertStrictEquals(withPrefix.accountId, "act_561430705400571");

  const digitsOnly = parseMetaAdAccountIdInput("561430705400571");
  assertStrictEquals(digitsOnly.ok, true);
  assertStrictEquals(digitsOnly.accountId, "act_561430705400571");
});

Deno.test("parseMetaAdAccountIdInput rejects invalid ids", () => {
  assertStrictEquals(parseMetaAdAccountIdInput("").ok, false);
  assertStrictEquals(parseMetaAdAccountIdInput("act_abc").ok, false);
});

Deno.test("metaAdAccountsEqual compares normalized ids", () => {
  assertStrictEquals(
    metaAdAccountsEqual("561430705400571", "act_561430705400571"),
    true,
  );
  assertStrictEquals(metaAdAccountsEqual("act_111", "act_222"), false);
});

Deno.test("validateMetaAdPlatform accepts facebook/meta aliases", () => {
  assertStrictEquals(validateMetaAdPlatform("meta").ok, true);
  assertStrictEquals(validateMetaAdPlatform("tiktok").ok, false);
});
