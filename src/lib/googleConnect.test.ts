import { describe, expect, it } from "vitest";
import { fragmentConnectCode, popupConnectCode } from "./googleConnect";

const SUPABASE_URL = "https://project.supabase.co";

const ATTEMPT_STATE = "the-state";

describe("popupConnectCode", () => {
  it("returns the code our edge function posted for this attempt", () => {
    expect(
      popupConnectCode(
        codeMessage(SUPABASE_URL, "gmail-auth", ATTEMPT_STATE),
        "gmail-auth",
        ATTEMPT_STATE,
        SUPABASE_URL,
      ),
    ).toEqual({
      provider: "gmail-auth",
      code: "the-code",
      state: ATTEMPT_STATE,
    });
  });

  it("ignores the same message from another origin", () => {
    expect(
      popupConnectCode(
        codeMessage("https://evil.example", "gmail-auth", ATTEMPT_STATE),
        "gmail-auth",
        ATTEMPT_STATE,
        SUPABASE_URL,
      ),
    ).toBeNull();
  });

  it("ignores a code meant for another provider", () => {
    expect(
      popupConnectCode(
        codeMessage(SUPABASE_URL, "google-calendar-auth", ATTEMPT_STATE),
        "gmail-auth",
        ATTEMPT_STATE,
        SUPABASE_URL,
      ),
    ).toBeNull();
  });

  it("ignores the code of another, overlapping attempt", () => {
    expect(
      popupConnectCode(
        codeMessage(SUPABASE_URL, "gmail-auth", "the-other-attempt"),
        "gmail-auth",
        ATTEMPT_STATE,
        SUPABASE_URL,
      ),
    ).toBeNull();
  });

  it("ignores every message when the Supabase URL is missing", () => {
    expect(
      popupConnectCode(
        codeMessage(SUPABASE_URL, "gmail-auth", ATTEMPT_STATE),
        "gmail-auth",
        ATTEMPT_STATE,
        "",
      ),
    ).toBeNull();
  });
});

describe("fragmentConnectCode", () => {
  it("reads the provider, code and state a full-page connect left", () => {
    expect(
      fragmentConnectCode(
        "#google_connect=google-ads-auth&code=c%2F1&state=s.sig",
      ),
    ).toEqual({ provider: "google-ads-auth", code: "c/1", state: "s.sig" });
  });

  it("ignores an unrelated or incomplete fragment", () => {
    expect(fragmentConnectCode("")).toBeNull();
    expect(fragmentConnectCode("#tab=settings")).toBeNull();
    expect(
      fragmentConnectCode("#google_connect=google-ads-auth&code=c"),
    ).toBeNull();
    expect(
      fragmentConnectCode("#google_connect=other&code=c&state=s"),
    ).toBeNull();
  });
});

function codeMessage(origin: string, provider: string, state: string) {
  return new MessageEvent("message", {
    origin,
    data: { type: "google_connect_code", provider, code: "the-code", state },
  });
}
