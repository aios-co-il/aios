import { auth, renderAuth, session } from "./authTestHarness";
import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("Auth session bootstrap", () => {
  it.each(["aal1", "aal2"])(
    "restores %s sessions that need no extra MFA",
    async (level) => {
      auth.session = session;
      auth.getAuthenticatorAssuranceLevel.mockResolvedValue({
        data: { currentLevel: level, nextLevel: level },
        error: null,
      });
      renderAuth();
      expect(await screen.findByText("Home route")).toBeInTheDocument();
      expect(auth.home).toHaveBeenCalledExactlyOnceWith(session.user.id);
    },
  );

  it("waits for an OAuth callback session and navigates only once", async () => {
    renderAuth("/auth?code=oauth-code");
    expect(screen.queryByLabelText("אימייל")).not.toBeInTheDocument();
    auth.session = session;
    await act(async () => {
      auth.listener?.("SIGNED_IN", session);
      auth.listener?.("INITIAL_SESSION", session);
    });
    expect(await screen.findByText("Home route")).toBeInTheDocument();
    expect(auth.home).toHaveBeenCalledTimes(1);
  });

  it("switches to password setup for a recovery event without navigating", async () => {
    renderAuth();
    await screen.findByLabelText("אימייל");
    await act(async () => auth.listener?.("PASSWORD_RECOVERY", session));
    expect(await screen.findByLabelText("סיסמה חדשה")).toBeInTheDocument();
    expect(auth.home).not.toHaveBeenCalled();
  });

  it("shows a usable sign-in form when no organization is found", async () => {
    auth.session = session;
    auth.home.mockResolvedValue(null);
    renderAuth();
    expect(await screen.findByLabelText("אימייל")).toBeInTheDocument();
    expect(auth.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "לא נמצא ארגון עבור המשתמש. נא לפנות לתמיכה.",
      }),
    );
  });

  it("cleans up the subscription and four-second fallback timer", async () => {
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const page = renderAuth();
    await screen.findByLabelText("אימייל");
    page.unmount();
    expect(auth.unsubscribe).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });

  it("keeps routing when invitation processing fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    auth.session = session;
    auth.invoke.mockRejectedValue(new Error("Invitation unavailable"));
    renderAuth();
    await waitFor(() =>
      expect(auth.home).toHaveBeenCalledWith(session.user.id),
    );
    expect(await screen.findByText("Home route")).toBeInTheDocument();
    errorLog.mockRestore();
  });
});
