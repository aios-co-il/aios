import { auth, renderAuth, requireMfa, session } from "./authTestHarness";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

describe("Auth recovery and invitations", () => {
  it.each([false, true])(
    "requests a recovery link using the same email; failure=%s",
    async (failure) => {
      if (failure) {
        auth.resetPasswordForEmail.mockResolvedValue({
          error: new Error("Reset failed"),
        });
      }
      renderAuth();
      const user = userEvent.setup();
      await user.type(
        await screen.findByLabelText("אימייל"),
        "user@example.test",
      );
      await user.click(screen.getByRole("button", { name: "שכחתי סיסמה" }));
      expect(screen.getByLabelText("אימייל")).toHaveValue("user@example.test");
      await user.click(
        screen.getByRole("button", { name: "שלח קישור לאיפוס סיסמה" }),
      );
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
        "user@example.test",
        { redirectTo: `${window.location.origin}/auth?type=recovery` },
      );
      if (failure) {
        expect(
          screen.getByRole("button", { name: "שלח קישור לאיפוס סיסמה" }),
        ).toBeEnabled();
      } else {
        expect(await screen.findByLabelText("סיסמה")).toBeInTheDocument();
      }
      expect(auth.home).not.toHaveBeenCalled();
    },
  );

  it("prefills invitation email and banner without displaying it in password setup", async () => {
    auth.invitation = {
      email: "invite@example.test",
      tenants: { name: "Test Org" },
      metadata: { fullName: "Test User" },
    };
    const page = renderAuth("/auth?token=invitation");
    await waitFor(() =>
      expect(screen.getByLabelText("אימייל")).toHaveValue(
        "invite@example.test",
      ),
    );
    expect(
      screen.getByText(/שלום Test User, הוזמנת להצטרף לTest Org/),
    ).toBeInTheDocument();
    page.unmount();
    renderAuth("/auth?type=invite&token=invitation");
    expect(await screen.findByLabelText("סיסמה חדשה")).toBeInTheDocument();
    expect(screen.queryByText(/שלום Test User/)).not.toBeInTheDocument();
  });

  it("rejects mismatching passwords without updating the account", async () => {
    renderAuth("/auth?type=recovery");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("סיסמה חדשה"), "password-one");
    await user.type(screen.getByLabelText("אימות סיסמה"), "password-two");
    await user.click(screen.getByRole("button", { name: "הגדר סיסמה" }));
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "הסיסמאות אינן תואמות" }),
    );
  });

  it("shows MFA after password setup and defers invitation processing until verification", async () => {
    auth.session = session;
    requireMfa();
    renderAuth("/auth?type=invite");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("סיסמה חדשה"), "new-password");
    await user.type(screen.getByLabelText("אימות סיסמה"), "new-password");
    await user.click(screen.getByRole("button", { name: "הגדר סיסמה" }));
    expect(await screen.findByLabelText("קוד אימות")).toBeInTheDocument();
    expect(auth.invoke).not.toHaveBeenCalled();
    expect(auth.home).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("קוד אימות"), "123456");
    await user.click(screen.getByRole("button", { name: "אמת" }));
    expect(await screen.findByText("Home route")).toBeInTheDocument();
    expect(auth.invoke).toHaveBeenCalledTimes(1);
  });
});
