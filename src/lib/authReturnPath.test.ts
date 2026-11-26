import { afterEach, describe, expect, it } from "vitest";
import {
  authPathReturningTo,
  rememberAuthReturnPath,
  takeAuthReturnPath,
} from "./authReturnPath";

describe("authReturnPath", () => {
  afterEach(() => sessionStorage.clear());

  it("carries an in-app page on the sign-in URL", () => {
    expect(authPathReturningTo("/t/acme/card-drafts")).toBe(
      "/auth?next=%2Ft%2Facme%2Fcard-drafts",
    );
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "/auth",
    "/auth?type=recovery",
  ])("never returns to %s", (path) => {
    expect(authPathReturningTo(path)).toBe("/auth");

    rememberAuthReturnPath(path);

    expect(takeAuthReturnPath()).toBeNull();
  });

  it("returns to the kept page once", () => {
    rememberAuthReturnPath("/t/acme/card-drafts");

    expect(takeAuthReturnPath()).toBe("/t/acme/card-drafts");
    expect(takeAuthReturnPath()).toBeNull();
  });
});
