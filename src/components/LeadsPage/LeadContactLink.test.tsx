import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LeadContactLink } from "./LeadContactLink";

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
});
