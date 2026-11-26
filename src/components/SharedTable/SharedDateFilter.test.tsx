import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import { stubResizeObserver } from "@/test/stubResizeObserver";
import { SharedDateFilter } from "./SharedDateFilter";

/** The first of the month in the "עד תאריך" calendar, which opens on this month. */
async function endCalendarFirstDay(customStart: Date) {
  const user = userEvent.setup();
  render(
    <SharedDateFilter
      value={{ filter: "custom", customStart, customEnd: customStart }}
      onChange={() => undefined}
    />,
  );
  await user.click(screen.getByRole("button"));
  await user.click(await screen.findByText("טווח מותאם אישית..."));
  const endGrid = (await screen.findAllByRole("grid"))[1];
  return within(endGrid)
    .getAllByRole("gridcell")
    .find(
      (cell) =>
        cell.textContent === "1" && !cell.className.includes("day-outside"),
    ) as HTMLButtonElement;
}

beforeAll(stubResizeObserver);

describe("SharedDateFilter", () => {
  it("offers no end more than 400 days after the picked start", async () => {
    const now = new Date();
    const longAgo = new Date(now.getFullYear() - 2, now.getMonth(), 1);

    const firstDay = await endCalendarFirstDay(longAgo);

    expect(firstDay.disabled).toBe(true);
  });

  it("offers an end within 400 days of the start", async () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const firstDay = await endCalendarFirstDay(lastMonth);

    expect(firstDay.disabled).toBe(false);
  });
});
