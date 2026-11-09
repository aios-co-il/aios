import {
  auth,
  renderAuth,
  requireMfa,
  session,
  signIn,
} from "./testUtils/authTestHarness";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

describe("AuthPage shared session error handling", () => {
  it("restores sign-in controls when the post-login session read fails", async () => {
    renderAuth();
    await screen.findByLabelText("אימייל");
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new Error("Session read failed"),
    });

    await signIn();

    await waitFor(() =>
      expect(auth.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Session read failed" }),
      ),
    );
    expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled();
    expect(auth.home).not.toHaveBeenCalled();
    expect(auth.invoke).not.toHaveBeenCalled();
  });

  it("restores verification controls when the verified session cannot be read", async () => {
    auth.session = session;
    requireMfa();
    renderAuth();
    const code = await screen.findByLabelText("קוד אימות");
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new Error("Verified session unavailable"),
    });
    const user = userEvent.setup();

    await user.type(code, "123456");
    await user.click(screen.getByRole("button", { name: "אמת" }));

    await waitFor(() =>
      expect(auth.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Verified session unavailable",
        }),
      ),
    );
    expect(screen.getByRole("button", { name: "אמת" })).toBeEnabled();
    expect(auth.home).not.toHaveBeenCalled();
    expect(auth.invoke).not.toHaveBeenCalled();
  });

  it.each(["currentLevel", "nextLevel"])(
    "blocks missing %s assurance before app entry",
    async (field) => {
      auth.getAuthenticatorAssuranceLevel.mockResolvedValue({
        data: { currentLevel: "aal1", nextLevel: "aal1", [field]: null },
        error: null,
      });
      renderAuth();

      await signIn();

      await waitFor(() => expect(auth.toast).toHaveBeenCalled());
      expect(auth.home).not.toHaveBeenCalled();
      expect(auth.invoke).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled();
    },
  );
});
