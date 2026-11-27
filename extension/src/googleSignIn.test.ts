import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_SIGN_IN_MESSAGE,
  GOOGLE_SIGN_IN_TEXT,
  type GoogleAuth,
  type GoogleSignInDeps,
  isGoogleSignInRequest,
  isGoogleSignInResult,
  readRedirect,
  signInWithGoogle,
} from "./googleSignIn";

const REDIRECT =
  "https://cenboedhooldhjnjeaeifdakocglmbba.chromiumapp.org/auth";
const GOOGLE_PAGE =
  "https://staging.supabase.co/auth/v1/authorize?provider=google";

/** Fakes for Supabase Auth and Chrome's identity API; `launch` plays Google's window. */
function fakeDeps(
  launch: GoogleSignInDeps["launchWebAuthFlow"] = async () =>
    `${REDIRECT}?code=one-time`,
) {
  const auth = {
    signInWithOAuth: vi.fn<GoogleAuth["signInWithOAuth"]>(async () => ({
      data: { url: GOOGLE_PAGE },
      error: null,
    })),
    exchangeCodeForSession: vi.fn<GoogleAuth["exchangeCodeForSession"]>(
      async () => ({ error: null }),
    ),
  };
  const launchWebAuthFlow = vi.fn(launch);

  return {
    auth,
    launchWebAuthFlow,
    deps: {
      auth,
      launchWebAuthFlow,
      redirectUrl: REDIRECT,
    },
  };
}

describe("signInWithGoogle", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks Supabase for Google's page with PKCE, opens it in Chrome and exchanges the code", async () => {
    const { auth, launchWebAuthFlow, deps } = fakeDeps();

    const result = await signInWithGoogle(deps);

    expect(result).toEqual({ ok: true });
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
    });
    expect(launchWebAuthFlow).toHaveBeenCalledWith(GOOGLE_PAGE);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("one-time");
  });

  it("says the sign-in was cancelled when the user closes Google's window", async () => {
    const { auth, deps } = fakeDeps(async () => {
      throw new Error("The user did not approve access.");
    });

    const result = await signInWithGoogle(deps);

    expect(result).toEqual({
      ok: false,
      message: GOOGLE_SIGN_IN_TEXT.cancelled,
    });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("says Google's page did not open when Chrome could not load it", async () => {
    const { deps } = fakeDeps(async () => {
      throw new Error("Authorization page could not be loaded.");
    });

    expect(await signInWithGoogle(deps)).toEqual({
      ok: false,
      message: GOOGLE_SIGN_IN_TEXT.unreachable,
    });
  });

  it("reports Supabase's refusal to start, with its reason", async () => {
    const { auth, launchWebAuthFlow, deps } = fakeDeps();
    auth.signInWithOAuth.mockResolvedValueOnce({
      data: { url: null },
      error: { message: "provider is not enabled" },
    });

    const result = await signInWithGoogle(deps);

    expect(result).toEqual({
      ok: false,
      message: `${GOOGLE_SIGN_IN_TEXT.failed}: provider is not enabled`,
    });
    expect(launchWebAuthFlow).not.toHaveBeenCalled();
  });

  it("reports a failed code exchange", async () => {
    const { auth, deps } = fakeDeps();
    auth.exchangeCodeForSession.mockResolvedValueOnce({
      error: { message: "invalid flow state" },
    });

    expect(await signInWithGoogle(deps)).toEqual({
      ok: false,
      message: `${GOOGLE_SIGN_IN_TEXT.failed}: invalid flow state`,
    });
  });
});

describe("readRedirect", () => {
  it("reads the code Supabase sent back", () => {
    expect(readRedirect(`${REDIRECT}?code=abc`, REDIRECT)).toEqual({
      code: "abc",
    });
  });

  it("treats a denied consent as a cancel", () => {
    expect(readRedirect(`${REDIRECT}?error=access_denied`, REDIRECT)).toEqual({
      cancelled: true,
    });
  });

  it("reads an error from the query or the fragment", () => {
    expect(
      readRedirect(
        `${REDIRECT}?error=server_error&error_description=Unable+to+exchange`,
        REDIRECT,
      ),
    ).toEqual({ error: "Unable to exchange" });
    expect(readRedirect(`${REDIRECT}#error=server_error`, REDIRECT)).toEqual({
      error: "server_error",
    });
  });

  it("refuses an address that is not the extension's, or none", () => {
    for (const returned of [
      "https://aios.co.il/?code=abc",
      `${REDIRECT}/other?code=abc`,
      undefined,
    ]) {
      expect(readRedirect(returned, REDIRECT)).toHaveProperty("error");
    }
  });
});

describe("the popup's request and the worker's reply", () => {
  it("knows its own messages only", () => {
    expect(isGoogleSignInRequest({ type: GOOGLE_SIGN_IN_MESSAGE })).toBe(true);
    expect(isGoogleSignInRequest({ type: "carmen:hello" })).toBe(false);
    expect(isGoogleSignInResult({ ok: true })).toBe(true);
    expect(isGoogleSignInResult({ ok: false, message: "x" })).toBe(true);
    expect(isGoogleSignInResult({ ok: false })).toBe(false);
    expect(isGoogleSignInResult(undefined)).toBe(false);
  });
});
