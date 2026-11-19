import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadContactLink } from "./LeadContactLink";

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast: toasts }));

afterEach(() => {
  vi.restoreAllMocks();
  toasts.success.mockClear();
  toasts.error.mockClear();
});

describe("LeadContactLink", () => {
  it("copies the phone in one click from its menu", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<LeadContactLink kind="phone" value="050-1234567" />);

    await user.click(screen.getByText("050-1234567"));
    expect(
      screen.getByRole("menuitem", { name: /התקשר/ }).getAttribute("href"),
    ).toBe("tel:050-1234567");
    await user.click(screen.getByRole("menuitem", { name: /העתק טלפון/ }));

    expect(writeText).toHaveBeenCalledWith("050-1234567");
  });

  it("offers send and copy for an email", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<LeadContactLink kind="email" value="lead@example.com" />);

    await user.click(screen.getByText("lead@example.com"));
    expect(
      screen.getByRole("menuitem", { name: /שלח מייל/ }).getAttribute("href"),
    ).toBe("mailto:lead@example.com");
    await user.click(screen.getByRole("menuitem", { name: /העתק אימייל/ }));

    expect(writeText).toHaveBeenCalledWith("lead@example.com");
  });

  it("reports a failure when the browser offers no clipboard", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<LeadContactLink kind="phone" value="050-1234567" />);
    await user.click(screen.getByText("050-1234567"));
    const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    try {
      await user.click(screen.getByRole("menuitem", { name: /העתק טלפון/ }));
      await waitFor(() =>
        expect(toasts.error).toHaveBeenCalledWith("לא ניתן להעתיק את הטלפון"),
      );
      expect(toasts.success).not.toHaveBeenCalled();
    } finally {
      if (clipboard) {
        Object.defineProperty(navigator, "clipboard", clipboard);
      } else {
        delete (navigator as { clipboard?: unknown }).clipboard;
      }
    }
  });
});
