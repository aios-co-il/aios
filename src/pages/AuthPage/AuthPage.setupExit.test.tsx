import {
  auth,
  renderAuth,
  requireMfa,
  session,
} from "./testUtils/authTestHarness";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

describe("AuthPage exits password setup", () => {
  it.each(["invite", "recovery"])(
    "returns from %s MFA to sign-in and stays there after SDK events",
    async (type) => {
      auth.session = session;
      requireMfa();
      renderAuth(`/auth?type=${type}`);
      const user = userEvent.setup();

      await user.type(
        await screen.findByLabelText("סיסמה חדשה"),
        "new-password",
      );
      await user.type(screen.getByLabelText("אימות סיסמה"), "new-password");
      await user.click(screen.getByRole("button", { name: "הגדר סיסמה" }));
      await screen.findByLabelText("קוד אימות");
      await user.click(screen.getByRole("button", { name: "חזור להתחברות" }));

      expect(
        await screen.findByLabelText("סיסמה", { exact: true }),
      ).toHaveValue("");
      expect(screen.queryByLabelText("סיסמה חדשה")).not.toBeInTheDocument();

      await act(async () => {
        await auth.listener?.("SIGNED_IN", session);
        await auth.listener?.("USER_UPDATED", session);
        await auth.listener?.("INITIAL_SESSION", session);
      });

      expect(
        screen.getByLabelText("סיסמה", { exact: true }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("קוד אימות")).not.toBeInTheDocument();
      expect(auth.invoke).not.toHaveBeenCalled();
      expect(auth.home).not.toHaveBeenCalled();
    },
  );
});
