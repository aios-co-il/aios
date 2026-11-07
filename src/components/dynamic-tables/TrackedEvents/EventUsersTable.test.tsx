import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventUsersTable } from "./EventUsersTable";

const steps = [
  { event: "page_view_valuation", label: "דף הערכה" },
  { event: "ticket_upload", label: "העלאת כרטיס" },
];

const result = {
  steps,
  total: {
    source: "סה״כ",
    users: { page_view_valuation: 100, ticket_upload: 50 },
    stepRates: { page_view_valuation: null, ticket_upload: 0.5 },
  },
  sources: [
    {
      source: "google / cpc",
      users: { page_view_valuation: 80, ticket_upload: 20 },
      stepRates: { page_view_valuation: null, ticket_upload: 0.25 },
    },
  ],
  funnelAvailable: true,
};

const formatNumber = (value: number) => String(value);

describe("EventUsersTable", () => {
  it("shows people per step with the total first and each step's conversion", () => {
    render(
      <EventUsersTable
        result={result}
        loading={false}
        failed={false}
        formatNumber={formatNumber}
      />,
    );
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("סה״כ")).toBeTruthy();
    expect(within(rows[1]).getByText("50.0%")).toBeTruthy();
    expect(within(rows[2]).getByText("google / cpc")).toBeTruthy();
    expect(within(rows[2]).getByText("25.0%")).toBeTruthy();
    expect(within(rows[2]).getByText("80")).toBeTruthy();
  });

  it("keeps the counts and shows a dash when GA's conversion is unavailable", () => {
    render(
      <EventUsersTable
        result={{
          ...result,
          total: {
            ...result.total,
            stepRates: { page_view_valuation: null, ticket_upload: null },
          },
          sources: [],
          funnelAvailable: false,
        }}
        loading={false}
        failed={false}
        formatNumber={formatNumber}
      />,
    );
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText(/אחוזי ההמרה לא זמינים/)).toBeTruthy();
  });

  it("says so when GA could not be read", () => {
    render(
      <EventUsersTable
        result={undefined}
        loading={false}
        failed
        formatNumber={formatNumber}
      />,
    );
    expect(screen.getByText(/לא הצלחנו לטעון/)).toBeTruthy();
  });
});
