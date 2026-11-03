import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  detectGoogleAdsError,
  googleAdsErrorBody,
  googleAdsErrorText,
  isManagerAccountError,
} from "./google-ads-errors.ts";

/** A searchStream failure shaped like the ones Google returns. */
const searchStreamFailure = (
  errorCode: Record<string, string>,
  message: string,
) => [
  {
    error: {
      code: 400,
      message: "Request contains an invalid argument.",
      status: "INVALID_ARGUMENT",
      details: [
        {
          "@type":
            "type.googleapis.com/google.ads.googleads.v23.errors.GoogleAdsFailure",
          errors: [{ errorCode, message }],
          requestId: "2Mgy9lv0HMW_sTqiysFrXQ",
        },
      ],
    },
  },
];

// Recorded in last_sync_diag for a report pointed at a manager account.
const MANAGER_ACCOUNT_RESPONSE = searchStreamFailure(
  { queryError: "REQUESTED_METRICS_FOR_MANAGER" },
  "Metrics cannot be requested for a manager account. To retrieve metrics, issue separate requests against each client account under the manager account.",
);

const NOT_ENABLED_RESPONSE = searchStreamFailure(
  { authorizationError: "CUSTOMER_NOT_ENABLED" },
  "The customer account cannot be accessed because it is not yet enabled.",
);

describe("detectGoogleAdsError", () => {
  it("finds the error inside the array searchStream returns", () => {
    const error = detectGoogleAdsError(MANAGER_ACCOUNT_RESPONSE);
    assertEquals(error?.status, "INVALID_ARGUMENT");
  });

  it("treats a bare string error as the message", () => {
    assertEquals(detectGoogleAdsError({ error: "quota exceeded" }), {
      message: "quota exceeded",
    });
  });

  it("reports no error for a successful or empty response", () => {
    assertEquals(
      detectGoogleAdsError([{ results: [{ campaign: { id: "1" } }] }]),
      null,
    );
    assertEquals(detectGoogleAdsError({ results: [] }), null);
    assertEquals(detectGoogleAdsError(null), null);
  });
});

describe("isManagerAccountError", () => {
  it("recognises a report pointed at a manager account", () => {
    assert(
      isManagerAccountError(detectGoogleAdsError(MANAGER_ACCOUNT_RESPONSE)),
    );
  });

  it("does not mistake other failures for a manager account", () => {
    assertEquals(
      isManagerAccountError(detectGoogleAdsError(NOT_ENABLED_RESPONSE)),
      false,
    );
  });
});

describe("googleAdsErrorText", () => {
  it("uses Google's specific reason instead of the outer placeholder", () => {
    assertEquals(
      googleAdsErrorText(detectGoogleAdsError(NOT_ENABLED_RESPONSE)),
      "The customer account cannot be accessed because it is not yet enabled. (CUSTOMER_NOT_ENABLED)",
    );
  });

  it("falls back to the outer message when there are no details", () => {
    const bare = detectGoogleAdsError({
      error: { message: "Permission denied." },
    });
    assertEquals(googleAdsErrorText(bare), "Permission denied.");
  });
});

describe("googleAdsErrorBody", () => {
  it("tells the user to pick the ad account under the manager", () => {
    const body = googleAdsErrorBody(
      detectGoogleAdsError(MANAGER_ACCOUNT_RESPONSE),
      "4568787244",
    );
    assertEquals(body.error, "manager_account_selected");
    assertMatch(body.message, /456-878-7244/);
    assertMatch(body.message, /חשבון ניהול \(MCC\)/);
    assertMatch(body.message, /לבחור את חשבון הפרסום עצמו/);
    assertEquals(body.details, body.message);
  });

  it("carries Google's wording for any other failure", () => {
    const body = googleAdsErrorBody(
      detectGoogleAdsError(NOT_ENABLED_RESPONSE),
      "1234567890",
    );
    assertEquals(body.error, "Google Ads API error");
    assertMatch(body.message, /CUSTOMER_NOT_ENABLED/);
  });
});
