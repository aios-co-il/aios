import { state } from "./testUtils/sdkMfaMocks";
import { AuthApiError } from "@supabase/supabase-js";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import {
  authResponse,
  restoreSession,
  renderAuth,
} from "./testUtils/sdkMfaHarness";

describe("AuthPage installed SDK bootstrap races", () => {
  it.each(["home", "invitation"])(
    "cancels older bootstrap %s work when password MFA fails",
    async (pending) => {
      let releasePending: (() => void) | undefined;
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
      // Flush queued SDK/Query bootstrap notifications before the fallback.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      // Cross the auth page's four-second spinner fallback to allow a retry.
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
        releasePending?.();
      });
      expect(state.home).toHaveBeenCalledTimes(pending === "home" ? 1 : 0);
      expect(screen.queryByText("Protected home")).not.toBeInTheDocument();
      expect(state.toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    },
  );
});
