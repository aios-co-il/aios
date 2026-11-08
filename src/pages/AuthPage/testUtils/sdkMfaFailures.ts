import { AuthApiError } from "@supabase/supabase-js";
import { vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";

/** Inject readiness failures at the actual SDK boundary, including malformed responses. */
export function mockReadinessFailure(failure: string) {
  const error = new AuthApiError(
    `Unavailable ${failure}`,
    503,
    "unexpected_failure",
  );
  let finishAssurance: (() => void) | undefined;
  if (failure === "assurance") {
    vi.spyOn(
      supabase.auth.mfa,
      "getAuthenticatorAssuranceLevel",
    ).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAssurance = () =>
            resolve({
              data: null,
              error,
            });
        }),
    );
  } else if (failure === "factors") {
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
      data: null,
      error,
    });
  } else if (
    [
      "null assurance",
      "unsupported current",
      "unsupported next",
      "null factors",
    ].includes(failure)
  ) {
    const method =
      failure === "null factors"
        ? "listFactors"
        : "getAuthenticatorAssuranceLevel";
    // Register the original method so restoreAllMocks can undo the override.
    vi.spyOn(supabase.auth.mfa, method);
    // Deliberately malformed SDK results cannot inhabit its declared response union.
    Object.defineProperty(supabase.auth.mfa, method, {
      configurable: true,
      value: async () => ({
        data: failure.startsWith("null")
          ? null
          : {
              currentLevel:
                failure === "unsupported current" ? "unexpected" : "aal1",
              nextLevel: failure === "unsupported next" ? "unexpected" : "aal2",
              currentAuthenticationMethods: [],
            },
        error: null,
      }),
    });
  } else if (failure === "missing factor") {
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
      data: { all: [], totp: [], phone: [], webauthn: [] },
      error: null,
    });
  } else if (failure === "session") {
    const signIn = supabase.auth.signInWithPassword.bind(supabase.auth);
    vi.spyOn(supabase.auth, "signInWithPassword").mockImplementation(
      async (credentials) => {
        const result = await signIn(credentials);
        vi.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
          data: { session: null },
          error,
        });
        return result;
      },
    );
  } else {
    vi.spyOn(
      supabase.auth.mfa,
      "getAuthenticatorAssuranceLevel",
    ).mockResolvedValue({
      data: {
        currentLevel: failure === "current level" ? null : "aal1",
        nextLevel: failure === "next level" ? null : "aal1",
        currentAuthenticationMethods: [],
      },
      error: null,
    });
  }
  return () => finishAssurance?.();
}
