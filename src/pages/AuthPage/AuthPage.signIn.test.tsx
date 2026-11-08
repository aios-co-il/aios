import { auth, renderAuth, session, signIn } from "./testUtils/authTestHarness";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

describe("AuthPage sign-in actions", () => {
  it("signs in once despite the SDK SIGNED_IN event and processes invitations first", async () => {
    renderAuth();
    await signIn();
    expect(await screen.findByText("Home route")).toBeInTheDocument();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.test",
      password: "password",
    });
    expect(auth.home).toHaveBeenCalledExactlyOnceWith(session.user.id);
    expect(auth.invoke).toHaveBeenCalledExactlyOnceWith(
      "process-user-invitation",
      { headers: { Authorization: "Bearer test-token" } },
    );
    expect(auth.invoke.mock.invocationCallOrder[0]).toBeLessThan(
      auth.home.mock.invocationCallOrder[0],
    );
  });

  it("shows password errors and restores controls", async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: new Error("Invalid login"),
    });
    renderAuth();
    await signIn();
    await waitFor(() =>
      expect(auth.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Invalid login" }),
      ),
    );
    expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled();
    expect(auth.home).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "Google OAuth keeps the auth redirect; failure=%s",
    async (failure) => {
      if (failure) {
        auth.signInWithOAuth.mockResolvedValue({
          error: new Error("OAuth failed"),
        });
      }

      renderAuth();
      const button = await screen.findByRole("button", {
        name: "התחבר עם Google",
      });
      const user = userEvent.setup();
      await user.click(button);
      expect(auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth` },
      });

      if (failure) {
        expect(button).toBeEnabled();
        expect(auth.toast).toHaveBeenCalledWith(
          expect.objectContaining({ description: "OAuth failed" }),
        );
      } else {
        expect(button).toBeDisabled();
      }
    },
  );

  it.each(["password", "google"])(
    "restores controls after a rejected %s mutation without retrying",
    async (provider) => {
      const request =
        provider === "password"
          ? auth.signInWithPassword
          : auth.signInWithOAuth;
      request.mockRejectedValue(new Error("Network rejected"));
      renderAuth();

      if (provider === "password") {
        await signIn();
      } else {
        const user = userEvent.setup();
        await user.click(
          await screen.findByRole("button", { name: "התחבר עם Google" }),
        );
      }

      await waitFor(() =>
        expect(auth.toast).toHaveBeenCalledWith(
          expect.objectContaining({ description: "Network rejected" }),
        ),
      );
      expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled();
      expect(request).toHaveBeenCalledTimes(1);
      expect(auth.home).not.toHaveBeenCalled();
    },
  );

  it("keeps the form pending until awaited navigation finishes", async () => {
    let finishHome: ((path: string | null) => void) | undefined;
    auth.home.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          finishHome = resolve;
        }),
    );
    renderAuth();

    await signIn();
    await waitFor(() => expect(auth.home).toHaveBeenCalledTimes(1));

    expect(screen.getByRole("button", { name: "מתחבר..." })).toBeDisabled();

    await act(async () => {
      finishHome?.(null);
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled(),
    );
    expect(auth.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "לא נמצא ארגון עבור המשתמש. נא לפנות לתמיכה.",
      }),
    );
  });
});
