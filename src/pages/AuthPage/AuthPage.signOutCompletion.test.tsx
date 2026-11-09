import {
  auth,
  renderAuth,
  requireMfa,
  session,
} from "./testUtils/authTestHarness";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

describe("AuthPage ignores unmounted form completion", () => {
  it.each(["setup", "mfa"])(
    "ignores %s completion after sign-out",
    async (flow) => {
      let finish: (() => void) | undefined;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const request = flow === "setup" ? auth.updateUser : auth.verify;
      request.mockImplementation(async () => {
        await pending;
        auth.session = session;
        return { error: null };
      });
      auth.session = session;
      const user = userEvent.setup();

      if (flow === "setup") {
        renderAuth("/auth?type=invite");
        await user.type(
          await screen.findByLabelText("סיסמה חדשה"),
          "new-password",
        );
        await user.type(screen.getByLabelText("אימות סיסמה"), "new-password");
        await user.click(screen.getByRole("button", { name: "הגדר סיסמה" }));
      } else {
        requireMfa();
        renderAuth();
        await user.type(await screen.findByLabelText("קוד אימות"), "123456");
        await user.click(screen.getByRole("button", { name: "אמת" }));
      }

      await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
      auth.session = null;
      await act(async () => {
        await auth.listener?.("SIGNED_OUT", null);
      });
      await screen.findByLabelText("סיסמה", { exact: true });
      auth.toast.mockClear();
      await act(async () => {
        finish?.();
      });

      expect(
        screen.getByLabelText("סיסמה", { exact: true }),
      ).toBeInTheDocument();
      expect(auth.home).not.toHaveBeenCalled();
      expect(auth.invoke).not.toHaveBeenCalled();
      expect(auth.toast).not.toHaveBeenCalled();
    },
  );
});
