import { auth, renderAuth, signIn } from "./testUtils/authTestHarness";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthApiError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const message = "האימייל או הסיסמה שגויים. נסה שוב.";

describe("AuthPage invalid credentials", () => {
  it("shows an accessible Hebrew error in the form without a toast", async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: new AuthApiError(
        "Invalid login credentials",
        400,
        "invalid_credentials",
      ),
    });
    renderAuth();
    await signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("אימייל")).toHaveValue("user@example.test");
    expect(screen.getByLabelText("אימייל")).toHaveAccessibleDescription(
      message,
    );
    expect(screen.getByLabelText("סיסמה")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("button", { name: "התחבר" })).toBeEnabled();
    expect(auth.toast).not.toHaveBeenCalled();
    expect(auth.home).not.toHaveBeenCalled();
  });

  it.each(["אימייל", "סיסמה"])(
    "clears the error when editing %s",
    async (label) => {
      auth.signInWithPassword.mockResolvedValue({
        error: new AuthApiError(
          "Invalid login credentials",
          400,
          "invalid_credentials",
        ),
      });
      renderAuth();
      const user = await signIn();
      await screen.findByRole("alert");
      await user.type(screen.getByLabelText(label), "x");

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByLabelText("סיסמה")).not.toHaveAttribute(
        "aria-invalid",
        "true",
      );
    },
  );

  it("clears the error on resubmission and can sign in successfully", async () => {
    auth.signInWithPassword.mockResolvedValueOnce({
      error: new AuthApiError(
        "Invalid login credentials",
        400,
        "invalid_credentials",
      ),
    });
    renderAuth();
    await signIn();
    await screen.findByRole("alert");
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const signInNormally = auth.signInWithPassword.getMockImplementation();
    auth.signInWithPassword.mockImplementationOnce(async () => {
      await pending;
      return signInNormally?.();
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "התחבר" }));
    await waitFor(() =>
      expect(auth.signInWithPassword).toHaveBeenCalledTimes(2),
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "מתחבר..." })).toBeDisabled();
    await act(async () => {
      finish?.();
    });
    expect(await screen.findByText("Home route")).toBeInTheDocument();
    expect(auth.toast).not.toHaveBeenCalled();
  });
});
