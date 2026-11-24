import { afterEach, describe, expect, it } from "vitest";
import {
  fragmentConnect,
  stashFragmentConnect,
  takeStashedConnect,
} from "./googleConnectFragment";

describe("fragmentConnect", () => {
  it("reads the provider, code and state a full-page connect left", () => {
    expect(
      fragmentConnect("#google_connect=google-ads-auth&code=c%2F1&state=s.sig"),
    ).toEqual({
      code: { provider: "google-ads-auth", code: "c/1", state: "s.sig" },
    });
  });

  it("reads the error a full-page connect returned with", () => {
    expect(
      fragmentConnect("#google_connect=google-ads-auth&error=access_denied"),
    ).toEqual({ provider: "google-ads-auth", error: "access_denied" });
  });

  it("ignores an unrelated or incomplete fragment", () => {
    expect(fragmentConnect("")).toBeNull();
    expect(fragmentConnect("#tab=settings")).toBeNull();
    expect(
      fragmentConnect("#google_connect=google-ads-auth&code=c"),
    ).toBeNull();
    expect(fragmentConnect("#google_connect=other&code=c&state=s")).toBeNull();
  });
});

describe("stashFragmentConnect", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    sessionStorage.clear();
  });

  it("keeps the connect once and clears the fragment", () => {
    window.history.replaceState(
      null,
      "",
      "/t/acme/integrations?tab=x#google_connect=gmail-auth&code=c&state=s",
    );

    stashFragmentConnect();

    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?tab=x");
    expect(takeStashedConnect()).toEqual({
      code: { provider: "gmail-auth", code: "c", state: "s" },
    });
    expect(takeStashedConnect()).toBeNull();
  });

  it("ignores a stored value that is not a connect", () => {
    sessionStorage.setItem("aios-google-connect", "{not json");

    expect(takeStashedConnect()).toBeNull();
    expect(sessionStorage.getItem("aios-google-connect")).toBeNull();
  });
});
