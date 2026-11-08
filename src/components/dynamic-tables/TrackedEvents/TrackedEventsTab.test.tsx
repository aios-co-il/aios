import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TrackedEventsEditor } from "./TrackedEventsEditor";
import { TrackedEventsTab } from "./TrackedEventsTab";
import {
  summarizeTrackedEvents,
  type TrackedEventRecord,
} from "./trackedEvents";

const format = {
  formatCurrency: (value: number) => `$${value.toFixed(2)}`,
  formatNumber: (value: number) => String(Math.round(value)),
};

const ga = (date: string, event_name: string, event_count: number) =>
  ({
    _source: "google_analytics",
    data: { report_type: "event_total", date, event_name, event_count },
  }) satisfies TrackedEventRecord;

describe("TrackedEventsTab", () => {
  it("shows each event's count and cost per event", () => {
    const summary = summarizeTrackedEvents(
      [ga("2026-11-01", "ticket_upload", 200), ga("2026-11-01", "sign_up", 50)],
      [
        { event: "ticket_upload", label: "העלאת כרטיס" },
        { event: "sign_up", label: "הרשמה לאתר" },
      ],
      500,
    );
    render(<TrackedEventsTab summary={summary} {...format} />);
    expect(screen.getAllByText("העלאת כרטיס").length).toBeGreaterThan(0);
    expect(screen.getByText("עלות לאירוע: $2.50")).toBeTruthy();
    expect(screen.getByText("עלות לאירוע: $10.00")).toBeTruthy();
    expect(screen.queryByText("עריכת אירועים")).toBeNull();
  });

  it("asks to pick events when the dashboard follows none", async () => {
    const onEdit = vi.fn();
    render(
      <TrackedEventsTab
        summary={{ events: [], days: [] }}
        {...format}
        onEdit={onEdit}
      />,
    );
    await userEvent.setup().click(screen.getByText("בחירת אירועים"));
    expect(onEdit).toHaveBeenCalledOnce();
  });
});

describe("TrackedEventsEditor", () => {
  it("saves the checked events, in order, with their labels", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TrackedEventsEditor
        open
        onOpenChange={() => {}}
        current={[{ event: "sign_up", label: "הרשמה" }]}
        available={[
          { event: "page_view", count: 900 },
          { event: "ticket_upload", count: 40 },
          { event: "sign_up", count: 20 },
        ]}
        currentRatio={null}
        onSave={onSave}
        saving={false}
      />,
    );
    await user.click(screen.getByLabelText("ticket_upload"));
    const labels = screen.getAllByPlaceholderText("שם בעברית");
    await user.type(labels[2], "העלאת כרטיס");
    await user.click(screen.getByText("שמירה"));
    expect(onSave).toHaveBeenCalledWith(
      [
        { event: "sign_up", label: "הרשמה" },
        { event: "ticket_upload", label: "העלאת כרטיס" },
      ],
      null,
    );
  });

  it("keeps the conversion pair while both events stay followed", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TrackedEventsEditor
        open
        onOpenChange={() => {}}
        current={[
          { event: "ticket_valuation", label: "הערכה" },
          { event: "ticket_sold", label: "מכירה" },
        ]}
        available={[]}
        currentRatio={{ from: "ticket_valuation", to: "ticket_sold" }}
        onSave={onSave}
        saving={false}
      />,
    );
    await userEvent.setup().click(screen.getByText("שמירה"));
    expect(onSave).toHaveBeenCalledWith(expect.any(Array), {
      from: "ticket_valuation",
      to: "ticket_sold",
    });
  });
});
