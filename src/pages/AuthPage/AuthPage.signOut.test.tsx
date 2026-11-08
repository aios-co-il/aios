import { auth, renderAuth, session, signIn } from "./testUtils/authTestHarness";
import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("AuthPage cancels stale navigation", () => {
  it("does not navigate when a home lookup finishes after sign-out", async () => {
    let finishHome: ((path: string) => void) | undefined;
    auth.home.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finishHome = resolve;
        }),
    );
    renderAuth();

    await signIn();
    await waitFor(() => expect(auth.home).toHaveBeenCalledTimes(1));
    auth.session = null;

    await act(async () => {
      await auth.listener?.("SIGNED_OUT", null);
    });
    await act(async () => {
      finishHome?.("/t/test/home");
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled(),
    );
    expect(screen.queryByText("Home route")).not.toBeInTheDocument();
    expect(auth.toast).not.toHaveBeenCalled();
  });

  it("does not start a home lookup after an invitation request finishes following sign-out", async () => {
    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    auth.invoke.mockImplementation(async () => {
      await waiting;
      return { error: null };
    });
    renderAuth();

    await signIn();
    await waitFor(() => expect(auth.invoke).toHaveBeenCalledTimes(1));
    auth.session = null;

    await act(async () => {
      await auth.listener?.("SIGNED_OUT", null);
    });
    await act(async () => {
      release?.();
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled(),
    );
    expect(auth.home).not.toHaveBeenCalled();
    expect(screen.queryByText("Home route")).not.toBeInTheDocument();
    expect(auth.toast).not.toHaveBeenCalled();
  });

  it("accepts a later restored session after the SDK rejects a password attempt", async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: new Error("Invalid login"),
    });
    renderAuth();

    await signIn();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled(),
    );
    auth.session = session;

    await act(async () => {
      await auth.listener?.("SIGNED_IN", session);
    });

    expect(await screen.findByText("Home route")).toBeInTheDocument();
    expect(auth.home).toHaveBeenCalledTimes(1);
  });

  it("ignores a password request that completes after sign-out", async () => {
    let finish: (() => void) | undefined;
    auth.signInWithPassword.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      auth.session = session;
      return { error: null };
    });
    renderAuth();

    await signIn();
    await waitFor(() =>
      expect(auth.signInWithPassword).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      await auth.listener?.("SIGNED_OUT", null);
    });
    await act(async () => {
      finish?.();
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled(),
    );
    expect(auth.home).not.toHaveBeenCalled();
    expect(auth.invoke).not.toHaveBeenCalled();
    expect(screen.queryByText("Home route")).not.toBeInTheDocument();
  });
});
