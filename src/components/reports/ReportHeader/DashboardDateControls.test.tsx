import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DashboardDateControls } from "./DashboardDateControls";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

/** The day button `day` in the calendar's `monthIndex`th shown month. */
function dayIn(monthIndex: number, day: number): HTMLButtonElement {
  const month = screen.getAllByRole("grid")[monthIndex];
  const button = within(month)
    .getAllByRole("gridcell")
    .find(
      (cell) =>
        cell.textContent === String(day) &&
        !cell.className.includes("day-outside"),
    );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`no day ${day} in month ${monthIndex}`);
  }
  return button;
}

describe("DashboardDateControls", () => {
  it("lets a custom range run at most 400 days, as the share links serve", async () => {
    const user = userEvent.setup();
    render(
      <DashboardDateControls
        dateFilter="custom"
        onDateFilterChange={() => undefined}
        customDateRange={{ from: new Date(2025, 0, 1) }}
        onCustomDateRangeChange={() => undefined}
      />,
    );
    await user.click(screen.getByRole("button", { name: /בחר תאריכים/ }));

    // From January 2025, twelve steps show January and February 2026.
    for (let step = 0; step < 12; step += 1) {
      await user.click(screen.getByRole("button", { name: /next month/i }));
    }

    // 2025-01-01 plus 399 days is 2026-02-04: the 400th day.
    expect(dayIn(1, 4).disabled).toBe(false);
    expect(dayIn(1, 5).disabled).toBe(true);
  });
});
