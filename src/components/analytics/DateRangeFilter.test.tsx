import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { isMatch } from "react-day-picker";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Calendar } from "@/components/ui/calendar";
import { DateRangeFilter } from "./DateRangeFilter";

type CalendarProps = ComponentProps<typeof Calendar>;

const mocks = vi.hoisted(() => ({ calendars: [] as Array<CalendarProps> }));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: (props: CalendarProps) => {
    mocks.calendars.push(props);
    return (
      <button
        onClick={(event) => {
          if (props.mode === "single") {
            const date = new Date(2026, 5, 5);
            props.onSelect?.(date, date, {}, event);
          }
        }}
      >
        choose bound
      </button>
    );
  },
}));

vi.mock("@/components/ui/dropdown-menu", () => {
  const Wrapper = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    DropdownMenu: Wrapper,
    DropdownMenuTrigger: Wrapper,
    DropdownMenuContent: Wrapper,
    DropdownMenuItem: Wrapper,
    DropdownMenuSeparator: () => null,
  };
});

vi.mock("@/components/ui/popover", () => {
  const Wrapper = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return { Popover: Wrapper, PopoverContent: Wrapper, PopoverTrigger: Wrapper };
});

afterEach(() => {
  cleanup();
  mocks.calendars.length = 0;
  vi.useRealTimers();
});

describe("DateRangeFilter disabled matching", () => {
  it("preserves DayPicker decisions before and after selecting bounds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));
    render(<DateRangeFilter onRangeChange={vi.fn()} />);
    const oldDay = new Date(2026, 5, 5);
    const laterDay = new Date(2026, 5, 12);
    const future = new Date(2026, 5, 20);
    const disabled = (index: number, date: Date) => {
      const matcher = mocks.calendars[mocks.calendars.length + index]?.disabled;
      if (typeof matcher !== "function") {
        throw new Error("Missing matcher");
      }
      return isMatch(date, [matcher]);
    };
    expect(disabled(-2, oldDay)).toBe(false);
    expect(disabled(-1, future)).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "choose bound" })[1]);
    expect(disabled(-2, laterDay)).toBe(true);
    expect(disabled(-2, oldDay)).toBe(false);
  });
});
