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

describe("AuthPage MFA attempt ownership", () => {
  it("keeps a newer verification locked when an old attempt settles", async () => {
    let finishOld: (() => void) | undefined;
    const oldRequest = new Promise<void>((resolve) => {
      finishOld = resolve;
    });
    auth.verify.mockImplementationOnce(async () => {
      await oldRequest;
      return { error: null };
    });
    auth.verify.mockImplementationOnce(() => new Promise(() => {}));
    auth.session = session;
    requireMfa();
    renderAuth();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("קוד אימות"), "123456");
    await user.click(screen.getByRole("button", { name: "אמת" }));
    await waitFor(() => expect(auth.verify).toHaveBeenCalledTimes(1));
    auth.session = null;
    await act(async () => {
      await auth.listener?.("SIGNED_OUT", null);
    });
    auth.session = session;
    await act(async () => {
      await auth.listener?.("SIGNED_IN", session);
    });

    await user.type(await screen.findByLabelText("קוד אימות"), "654321");
    await user.click(screen.getByRole("button", { name: "אמת" }));
    await waitFor(() => expect(auth.verify).toHaveBeenCalledTimes(2));
    await act(async () => {
      finishOld?.();
    });
    auth.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });
    const refreshed = { ...session, access_token: "refreshed-token" };
    auth.session = refreshed;
    await act(async () => {
      await auth.listener?.("SIGNED_IN", refreshed);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(auth.home).not.toHaveBeenCalled();
    expect(auth.invoke).not.toHaveBeenCalled();
    expect(screen.queryByText("Home route")).not.toBeInTheDocument();
  });

  it("suppresses verification errors from a form left by sign-out", async () => {
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    auth.verify.mockImplementation(async () => {
      await pending;
      return { error: new Error("Stale verification failed") };
    });
    requireMfa();
    renderAuth();
    const user = await signIn();
    await user.type(await screen.findByLabelText("קוד אימות"), "123456");
    await user.click(screen.getByRole("button", { name: "אמת" }));
    await waitFor(() => expect(auth.verify).toHaveBeenCalledTimes(1));
    auth.session = null;
    await act(async () => {
      await auth.listener?.("SIGNED_OUT", null);
    });
    await screen.findByLabelText("סיסמה", { exact: true });
    auth.toast.mockClear();
    await act(async () => {
      finish?.();
    });

    expect(auth.toast).not.toHaveBeenCalled();
    expect(auth.home).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled();
  });
});
