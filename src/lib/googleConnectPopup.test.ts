import { describe, expect, it } from "vitest";
import {
  popupAttempt,
  popupConnectResult,
  type PopupAttempt,
} from "./googleConnectPopup";

const CALLBACK_ORIGIN = "https://api.aios.co.il";

const ATTEMPT: PopupAttempt = {
  provider: "gmail-auth",
  state: "the-state",
  callbackOrigin: CALLBACK_ORIGIN,
};

describe("popupAttempt", () => {
  it("takes the state and the callback origin from Google's authorize URL", () => {
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set(
      "redirect_uri",
      "https://api.aios.co.il/functions/v1/gmail-auth",
    );
    authUrl.searchParams.set("state", "the-state");

    expect(popupAttempt(authUrl.toString(), "gmail-auth")).toEqual(ATTEMPT);
  });

  it("trusts no origin when the redirect URI is missing or not https", () => {
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    expect(
      popupAttempt(authUrl.toString(), "gmail-auth").callbackOrigin,
    ).toBeNull();

    authUrl.searchParams.set("redirect_uri", "http://api.aios.co.il/x");
    expect(
      popupAttempt(authUrl.toString(), "gmail-auth").callbackOrigin,
    ).toBeNull();
  });
});

describe("popupConnectResult", () => {
  it("returns the code the callback posted for this attempt", () => {
    expect(
      popupConnectResult(
        codeMessage(CALLBACK_ORIGIN, "gmail-auth", "the-state"),
        ATTEMPT,
      ),
    ).toEqual({
      code: { provider: "gmail-auth", code: "the-code", state: "the-state" },
    });
  });

  it("returns the error the callback posted for this attempt", () => {
    const event = new MessageEvent("message", {
      origin: CALLBACK_ORIGIN,
      data: {
        type: "google_connect_error",
        provider: "gmail-auth",
        state: "the-state",
        error: "invalid_state",
      },
    });

    expect(popupConnectResult(event, ATTEMPT)).toEqual({
      error: "invalid_state",
    });
  });

  it("ignores the same message from another origin", () => {
    expect(
      popupConnectResult(
        codeMessage("https://evil.example", "gmail-auth", "the-state"),
        ATTEMPT,
      ),
    ).toBeNull();
  });

  it("ignores a code meant for another provider", () => {
    expect(
      popupConnectResult(
        codeMessage(CALLBACK_ORIGIN, "google-calendar-auth", "the-state"),
        ATTEMPT,
      ),
    ).toBeNull();
  });

  it("ignores the code of another, overlapping attempt", () => {
    expect(
      popupConnectResult(
        codeMessage(CALLBACK_ORIGIN, "gmail-auth", "the-other-attempt"),
        ATTEMPT,
      ),
    ).toBeNull();
  });

  it("ignores every message when the callback origin is unknown", () => {
    expect(
      popupConnectResult(
        codeMessage(CALLBACK_ORIGIN, "gmail-auth", "the-state"),
        { ...ATTEMPT, callbackOrigin: null },
      ),
    ).toBeNull();
  });
});

function codeMessage(origin: string, provider: string, state: string) {
  return new MessageEvent("message", {
    origin,
    data: { type: "google_connect_code", provider, code: "the-code", state },
  });
}
