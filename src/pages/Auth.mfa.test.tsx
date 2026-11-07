import { AuthApiError, createClient } from "@supabase/supabase-js";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReadinessFailure } from "./Auth.mfa.failures.test-fixture";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import {
  user,
  authResponse,
  restoreSession,
  renderAuth,
  signIn,
} from "./Auth.mfa.test-fixture";

const state = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
  home: vi.fn<(userId: string) => Promise<string | null>>(),
  toast: vi.fn(),
  needsMfa: false,
  requests: [] as Array<Request>,
  events: [] as Array<string>,
}));

vi.mock("@/lib/appHomePath", () => ({ resolveAppHomePath: state.home }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: state.toast }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createClient<Database>("https://mfa.test", "test-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: (...args) => state.fetch(...args) },
  }),
}));

beforeEach(async () => {
  state.needsMfa = false;
  state.home.mockReset().mockResolvedValue("/t/test/home");
  state.toast.mockReset();
  state.events = [];
  state.fetch
    .mockReset()
    .mockImplementation((input, init) =>
      authResponse(input, init, state.needsMfa, state.requests),
    );
  await supabase.auth.signOut({ scope: "local" });
  state.requests = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Auth password MFA readiness", () => {
  it.each([
    "assurance",
    "factors",
    "missing factor",
    "null factors",
    "null assurance",
    "unsupported current",
    "unsupported next",
    "current level",
    "next level",
    "session",
  ])(
    "blocks navigation and restores the form after %s failure",
    async (failure) => {
      state.needsMfa = ["factors", "missing factor", "null factors"].includes(
        failure,
      );
      const finishAssurance = mockReadinessFailure(failure);
      await signIn(state.events);
      if (failure === "assurance") {
        expect(screen.getByRole("button", { name: "מתחבר..." })).toBeDisabled();
        expect(state.home).not.toHaveBeenCalled();
        finishAssurance();
      }
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled(),
      );
      expect(state.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "שגיאה", variant: "destructive" }),
      );
      if (
        [
          "null assurance",
          "unsupported current",
          "unsupported next",
          "null factors",
        ].includes(failure)
      ) {
        expect(state.toast).toHaveBeenCalledWith(
          expect.objectContaining({
            description:
              failure === "null factors"
                ? "לא נמצא גורם אימות נתמך. נא לפנות לתמיכה."
                : "לא ניתן לאמת את רמת האימות. נא לנסות להתחבר שוב.",
          }),
        );
      }
      expect(state.home).not.toHaveBeenCalled();
      expect(state.requests.some((r) => r.url.includes("/functions/"))).toBe(
        false,
      );
      // A later SDK sign-in notification must not bypass the failed password flow.
      await restoreSession();
      expect(state.home).not.toHaveBeenCalled();
    },
  );

  it("allows a later restored session after password authentication rejects", async () => {
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new AuthApiError(
        "Invalid credentials",
        400,
        "invalid_credentials",
      ),
    });
    await signIn(state.events, false);
    expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled();
    expect(state.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Invalid credentials" }),
    );
    await restoreSession();
    expect(await screen.findByText("Protected home")).toBeInTheDocument();
    expect(state.home).toHaveBeenCalledExactlyOnceWith(user.id);
  });

  it.each(["password", "restored session"])(
    "keeps %s navigation and processes invitations once",
    async (entry) => {
      if (entry === "password") {
        await signIn(state.events);
      } else {
        await restoreSession();
        renderAuth();
      }
      expect(await screen.findByText("Protected home")).toBeInTheDocument();
      expect(state.home).toHaveBeenCalledExactlyOnceWith(user.id);
      expect(
        state.requests.filter((r) => r.url.includes("/functions/")),
      ).toHaveLength(1);
    },
  );

  it.each(["home", "invitation"])(
    "cancels older bootstrap %s work when password MFA fails",
    async (pending) => {
      let releasePending: () => void = () => undefined;
      if (pending === "home") {
        state.home.mockReturnValue(
          new Promise((resolve) => {
            releasePending = () => resolve("/t/test/home");
          }),
        );
      } else {
        state.fetch.mockImplementation(async (input, init) => {
          if (new Request(input, init).url.includes("/functions/")) {
            await new Promise<void>((resolve) => {
              releasePending = resolve;
            });
          }
          return authResponse(input, init, state.needsMfa, state.requests);
        });
      }
      await restoreSession();
      vi.useFakeTimers();
      renderAuth();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4100);
      });
      vi.useRealTimers();
      expect(state.home).toHaveBeenCalledTimes(pending === "home" ? 1 : 0);
      vi.spyOn(
        supabase.auth.mfa,
        "getAuthenticatorAssuranceLevel",
      ).mockResolvedValue({
        data: null,
        error: new AuthApiError(
          "Assurance unavailable",
          503,
          "unexpected_failure",
        ),
      });
      const interaction = userEvent.setup();
      await interaction.type(
        screen.getByLabelText("אימייל"),
        "user@example.test",
      );
      await interaction.type(screen.getByLabelText("סיסמה"), "password-123");
      await interaction.click(screen.getByRole("button", { name: "התחבר" }));
      expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled();
      await act(async () => {
        releasePending();
      });
      expect(state.home).toHaveBeenCalledTimes(pending === "home" ? 1 : 0);
      expect(screen.queryByText("Protected home")).not.toBeInTheDocument();
      expect(state.toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    },
  );

  it("waits for TOTP verification before navigating", async () => {
    state.needsMfa = true;
    const interaction = await signIn(state.events);
    expect(await screen.findByText("אימות דו-שלבי")).toBeInTheDocument();
    expect(state.home).not.toHaveBeenCalled();
    expect(state.requests.some((r) => r.url.includes("/functions/"))).toBe(
      false,
    );
    await interaction.type(screen.getByLabelText("קוד אימות"), "123456");
    await interaction.click(screen.getByRole("button", { name: "אמת" }));
    expect(await screen.findByText("Protected home")).toBeInTheDocument();
    expect(state.home).toHaveBeenCalledExactlyOnceWith(user.id);
    const verification = state.requests.find((r) =>
      r.url.endsWith("/factors/factor-1/verify"),
    );
    expect(verification?.method).toBe("POST");
    expect(await verification?.json()).toEqual({
      challenge_id: "challenge-1",
      code: "123456",
    });
  });
});
