import {
  auth,
  renderAuth,
  requireMfa,
  session,
  signIn,
} from "./testUtils/authTestHarness";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

describe("AuthPage MFA boundary", () => {
  it.each(["password", "restored"])(
    "requires TOTP before navigation for %s sessions",
    async (mode) => {
      requireMfa();

      if (mode === "restored") {
        auth.session = session;
      }

      renderAuth();

      if (mode === "password") {
        await signIn();
      }

      const code = await screen.findByLabelText("קוד אימות");
      expect(auth.home).not.toHaveBeenCalled();
      expect(auth.invoke).not.toHaveBeenCalled();
      auth.session = session;
      const user = userEvent.setup();
      await user.type(code, "12x3456");
      await user.click(screen.getByRole("button", { name: "אמת" }));
      expect(await screen.findByText("Home route")).toBeInTheDocument();
      expect(auth.verify).toHaveBeenCalledWith({
        factorId: "factor-id",
        challengeId: "challenge-id",
        code: "123456",
      });
      expect(auth.invoke).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["password", "restored"])(
    "fails visibly on assurance errors for %s sessions",
    async (mode) => {
      auth.getAuthenticatorAssuranceLevel.mockResolvedValue({
        data: null,
        error: new Error("MFA unavailable"),
      });

      if (mode === "restored") {
        auth.session = session;
      }

      renderAuth();

      if (mode === "password") {
        await signIn();
      }

      await waitFor(() =>
        expect(auth.toast).toHaveBeenCalledWith(
          expect.objectContaining({ description: "MFA unavailable" }),
        ),
      );
      expect(
        await screen.findByRole("button", { name: "התחבר" }),
      ).toBeEnabled();
      expect(auth.home).not.toHaveBeenCalled();
      expect(auth.invoke).not.toHaveBeenCalled();
      await act(async () => auth.listener?.("SIGNED_IN", session));
      expect(auth.home).not.toHaveBeenCalled();
    },
  );

  it.each(["lookup", "missing"])(
    "blocks navigation on factor %s failure",
    async (failure) => {
      requireMfa();
      auth.listFactors.mockResolvedValue(
        failure === "lookup"
          ? { data: null, error: new Error("Factors failed") }
          : { data: { totp: [] }, error: null },
      );
      renderAuth();
      await signIn();
      await waitFor(() => expect(auth.toast).toHaveBeenCalled());
      expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled();
      expect(auth.home).not.toHaveBeenCalled();
      expect(auth.invoke).not.toHaveBeenCalled();
    },
  );

  it("keeps the challenge usable after verification failure and supports returning to sign-in", async () => {
    requireMfa();
    auth.verify.mockResolvedValue({ error: new Error("Invalid code") });
    renderAuth();
    const user = await signIn();
    await user.type(await screen.findByLabelText("קוד אימות"), "123456");
    await user.click(screen.getByRole("button", { name: "אמת" }));
    expect(auth.home).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "אמת" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "חזור להתחברות" }));
    expect(await screen.findByLabelText("סיסמה")).toHaveValue("");
  });

  it("requires MFA again after a remount during the prompt", async () => {
    requireMfa();
    auth.session = session;
    const first = renderAuth();
    await screen.findByLabelText("קוד אימות");
    first.unmount();
    renderAuth();
    expect(await screen.findByLabelText("קוד אימות")).toBeInTheDocument();
    expect(auth.home).not.toHaveBeenCalled();
    expect(auth.invoke).not.toHaveBeenCalled();
  });

  it.each(["currentLevel", "nextLevel"])(
    "rejects an unsupported %s without navigating",
    async (field) => {
      auth.getAuthenticatorAssuranceLevel.mockResolvedValue({
        data: {
          currentLevel: "aal1",
          nextLevel: "aal1",
          [field]: "unsupported",
        },
        error: null,
      });
      renderAuth();
      await signIn();
      await waitFor(() => expect(auth.toast).toHaveBeenCalled());
      expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled();
      expect(auth.home).not.toHaveBeenCalled();
      expect(auth.invoke).not.toHaveBeenCalled();
    },
  );
});
