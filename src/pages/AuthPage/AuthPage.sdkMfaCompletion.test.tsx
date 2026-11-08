import { state } from "./testUtils/sdkMfaMocks";
import { AuthApiError } from "@supabase/supabase-js";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import {
  user,
  authResponse,
  restoreSession,
  renderAuth,
  signIn,
} from "./testUtils/sdkMfaHarness";

describe("AuthPage installed SDK completion", () => {
  it("waits for SIGNED_IN when the SDK token response is delayed", async () => {
    state.fetch.mockImplementation(async (input, init) => {
      if (new URL(new Request(input, init).url).pathname === "/auth/v1/token") {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      return authResponse(input, init, state.needsMfa, state.requests);
    });

    await signIn(state.events);

    expect(state.events).toContain("SIGNED_IN");
    expect(await screen.findByText("Protected home")).toBeInTheDocument();
  });

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
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "האימייל או הסיסמה שגויים. נסה שוב.",
    );
    expect(state.toast).not.toHaveBeenCalled();
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
