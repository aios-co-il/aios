import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  googleAdsTableAccount,
  normalizeGoogleAdsCustomerId,
} from "./google-customer-id.ts";

Deno.test("normalizeGoogleAdsCustomerId", async (t) => {
  await t.step("drops the dashes people type from Google Ads", () => {
    assertStrictEquals(
      normalizeGoogleAdsCustomerId("804-455-7496"),
      "8044557496",
    );
    assertStrictEquals(
      normalizeGoogleAdsCustomerId(" 268 597 9380 "),
      "2685979380",
    );
  });

  await t.step("keeps an id that is already bare", () => {
    assertStrictEquals(
      normalizeGoogleAdsCustomerId("5902499742"),
      "5902499742",
    );
    assertStrictEquals(normalizeGoogleAdsCustomerId(5902499742), "5902499742");
  });

  await t.step("nothing to read is null", () => {
    assertStrictEquals(normalizeGoogleAdsCustomerId(""), null);
    assertStrictEquals(normalizeGoogleAdsCustomerId(" - "), null);
    assertStrictEquals(normalizeGoogleAdsCustomerId(null), null);
    assertStrictEquals(normalizeGoogleAdsCustomerId(undefined), null);
  });
});

Deno.test("googleAdsTableAccount", async (t) => {
  await t.step(
    "a table saved with dashes reads the bare id and logs in as it",
    () => {
      assertEquals(googleAdsTableAccount({ customer_id: "804-455-7496" }), {
        customerId: "8044557496",
        loginCustomerId: "8044557496",
      });
    },
  );

  await t.step("a manager id is the login, without dashes", () => {
    assertEquals(
      googleAdsTableAccount({
        customer_id: "268-597-9380",
        manager_id: "162-587-8765",
      }),
      { customerId: "2685979380", loginCustomerId: "1625878765" },
    );
  });

  await t.step("no account is null", () => {
    assertEquals(googleAdsTableAccount({}), {
      customerId: null,
      loginCustomerId: null,
    });
  });
});
