import { AuthApiError, createClient } from "@supabase/supabase-js";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import Auth from "./Auth";
import { user, sessionResponse, authResponse } from "./Auth.mfa.test-fixture";

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

/** Restore a valid session through the real SDK, including its SIGNED_IN event. */
async function restoreSession() {
  await supabase.auth.setSession({
    access_token: sessionResponse().access_token,
    refresh_token: "synthetic-refresh",
  });
}

/** Mount the same Auth entry route used for password and restored sessions. */
function renderAuth() {
  render(
    <MemoryRouter initialEntries={["/auth"]}>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/t/test/home" element={<p>Protected home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Submit the actual form while keeping the SDK's SIGNED_IN event observable. */
async function signIn() {
  const interaction = userEvent.setup();
  const { data } = supabase.auth.onAuthStateChange((event) => {
    state.events.push(event);
  });
  renderAuth();
  await interaction.type(
    await screen.findByLabelText("אימייל"),
    "user@example.test",
  );
  await interaction.type(screen.getByLabelText("סיסמה"), "password-123");
  await interaction.click(screen.getByRole("button", { name: "התחבר" }));
  data.subscription.unsubscribe();
  expect(state.events).toContain("SIGNED_IN");
  return interaction;
}

describe("Auth password MFA readiness", () => {
  it.each([
    "assurance",
    "factors",
    "missing factor",
    "current level",
    "next level",
    "session",
  ])(
    "blocks navigation and restores the form after %s failure",
    async (failure) => {
      state.needsMfa = failure === "factors" || failure === "missing factor";
      const error = new AuthApiError(
        `Unavailable ${failure}`,
        503,
        "unexpected_failure",
      );
      let finishAssurance: () => void = () => undefined;
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
      } else if (failure === "missing factor") {
        vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
          data: { all: [], totp: [], phone: [], webauthn: [] },
          error: null,
        });
      } else if (failure === "session") {
        const assurance = supabase.auth.mfa.getAuthenticatorAssuranceLevel.bind(
          supabase.auth.mfa,
        );
        vi.spyOn(
          supabase.auth.mfa,
          "getAuthenticatorAssuranceLevel",
        ).mockImplementation(async () => {
          const result = await assurance();
          vi.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
            data: { session: null },
            error,
          });
          return result;
        });
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
      await signIn();
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
      expect(state.home).not.toHaveBeenCalled();
      expect(state.requests.some((r) => r.url.includes("/functions/"))).toBe(
        false,
      );
      // A later SDK sign-in notification must not bypass the failed password flow.
      await restoreSession();
      expect(state.home).not.toHaveBeenCalled();
    },
  );

  it.each(["password", "restored session"])(
    "keeps %s navigation and processes invitations once",
    async (entry) => {
      if (entry === "password") {
        await signIn();
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

  it("cancels an older bootstrap navigation when password MFA fails", async () => {
    let releaseHome: (path: string) => void = () => undefined;
    state.home.mockReturnValue(
      new Promise((resolve) => {
        releaseHome = resolve;
      }),
    );
    await restoreSession();
    vi.useFakeTimers();
    renderAuth();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    vi.useRealTimers();
    expect(state.home).toHaveBeenCalledTimes(1);
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
      releaseHome("/t/test/home");
    });
    expect(screen.queryByText("Protected home")).not.toBeInTheDocument();
    expect(state.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });

  it("waits for TOTP verification before navigating", async () => {
    state.needsMfa = true;
    const interaction = await signIn();
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
