import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactValue } from "./ContactValue";

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast: toasts }));

afterEach(() => {
  vi.restoreAllMocks();
  toasts.success.mockClear();
  toasts.error.mockClear();
});

describe("ContactValue", () => {
  it("shows the phone as selectable text, outside any link or button", () => {
    render(<ContactValue kind="phone" value="050-1234567" />);

    const text = screen.getByText("050-1234567");

    expect(text.closest("a, button")).toBeNull();
    expect(text.className).toContain("select-text");
  });

  it("copies the phone in one click on the copy icon", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<ContactValue kind="phone" value="050-1234567" />);

    await user.click(screen.getByRole("button", { name: "העתק טלפון" }));

    expect(writeText).toHaveBeenCalledWith("050-1234567");
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith("הטלפון הועתק"),
    );
  });

  it("keeps the call and mail links on the leading icon", () => {
    render(
      <>
        <ContactValue kind="phone" value="050-1234567" />
        <ContactValue kind="email" value="lead@example.com" />
      </>,
    );

    expect(
      screen.getByRole("link", { name: "התקשר" }).getAttribute("href"),
    ).toBe("tel:050-1234567");
    expect(
      screen.getByRole("link", { name: "שלח מייל" }).getAttribute("href"),
    ).toBe("mailto:lead@example.com");
  });

  it("copies an email", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<ContactValue kind="email" value="lead@example.com" />);

    await user.click(screen.getByRole("button", { name: "העתק אימייל" }));

    expect(writeText).toHaveBeenCalledWith("lead@example.com");
  });

  it("keeps clicks on the value away from the surrounding row", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <ContactValue kind="phone" value="050-1234567" />
      </div>,
    );

    await user.click(screen.getByText("050-1234567"));
    await user.click(screen.getByRole("button", { name: "העתק טלפון" }));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("reports a failure when the browser offers no clipboard", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ContactValue kind="phone" value="050-1234567" />);
    const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    try {
      await user.click(screen.getByRole("button", { name: "העתק טלפון" }));

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
