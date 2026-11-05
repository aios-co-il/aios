import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  isRateLimitRun,
  META_REPORT_TYPES,
  platformFor,
} from "./run-status.ts";

describe("isRateLimitRun", () => {
  it("is true for a passed-over run and a run Meta refused for its rate", () => {
    assertStrictEquals(
      isRateLimitRun({
        status: "skipped",
        summary: { skipped_reason: "platform_rate_limited" },
      }),
      true,
    );
    assertStrictEquals(
      isRateLimitRun({
        status: "failed",
        summary: { error_kind: "rate_limit" },
      }),
      true,
    );
  });

  it("is false for any other run, or a summary that is not an object", () => {
    assertStrictEquals(
      isRateLimitRun({ status: "failed", summary: { error_kind: "auth" } }),
      false,
    );
    assertStrictEquals(
      isRateLimitRun({
        status: "ok",
        summary: { skipped_reason: "platform_rate_limited" },
      }),
      false,
    );
    assertStrictEquals(
      isRateLimitRun({ status: "skipped", summary: "x" }),
      false,
    );
    assertStrictEquals(isRateLimitRun(null), false);
  });
});

describe("platformFor", () => {
  it("maps the reconciled report types and nothing else", () => {
    assertStrictEquals(platformFor("facebook_insights"), "meta");
    assertStrictEquals(platformFor("facebook_ecommerce"), "meta");
    assertStrictEquals(platformFor("google_ads"), "google");
    assertStrictEquals(platformFor("google_analytics"), null);
    assertEquals(META_REPORT_TYPES, [
      "facebook_insights",
      "facebook_ecommerce",
    ]);
  });
});
