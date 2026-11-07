import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MicrosoftSignInButton } from "./MicrosoftSignInButton";

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithOAuth: mocks.signInWithOAuth } },
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

describe("MicrosoftSignInButton", () => {
  beforeEach(() => {
    mocks.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
  });

  it("starts Supabase's Azure sign-in with the email scope and redirect", async () => {
    render(<MicrosoftSignInButton redirectTo="https://aios.co.il/auth" />);
    await userEvent.click(screen.getByRole("button", { name: /Microsoft/ }));
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "azure",
      options: { redirectTo: "https://aios.co.il/auth", scopes: "email" },
    });
  });

  it("shows the error and re-enables the button when sign-in fails", async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: {},
      error: new Error("provider is not enabled"),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<MicrosoftSignInButton redirectTo="https://aios.co.il/auth" />);
    const button = screen.getByRole("button", { name: /Microsoft/ });
    await userEvent.click(button);
    expect(mocks.toastError).toHaveBeenCalledWith("provider is not enabled");
    await waitFor(() => expect(button).toBeEnabled());
  });
});
