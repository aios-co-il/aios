import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdsGoalTables } from "./AdsGoalTables";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const googleTable = {
  id: "g",
  integration_type: "google_ads",
  integration_settings: { campaign_type: "leads", currency: "USD" },
};

/** One Google Ads campaign day with its campaign's goal. */
function googleDay(
  name: string,
  goal: "ecommerce" | "leads",
  data: Record<string, unknown>,
) {
  return {
    data: {
      date: "2026-10-20",
      campaign_id: name,
      campaign_name: name,
      conversion_goal: goal,
      ...data,
    },
  };
}

/** A sales campaign whose value per conversion looks like broken tracking, and a lead campaign. */
const records = [
  googleDay("pmax", "ecommerce", {
    cost: 200,
    conversions: 13,
    conversions_value: 90,
  }),
  googleDay("search", "leads", { cost: 100, conversions: 5 }),
];

describe("AdsGoalTables", () => {
  it("splits a Google report by campaign goal, with the spend over every goal", () => {
    render(
      <AdsGoalTables
        table={googleTable}
        records={records}
        previousRecords={undefined}
        level="campaign"
        woo={null}
        manualRoi={{ readOnly: true }}
        showTrackingWarnings
      />,
    );
    expect(screen.getByText("pmax")).toBeInTheDocument();
    expect(screen.getByText("search")).toBeInTheDocument();
    expect(screen.getByText("הוצאה כוללת (כל היעדים)")).toBeInTheDocument();
    expect(screen.queryByText("תקופה קודמת")).toBeNull();
  });

  it("notes suspicious sales values only where the agency reads them", () => {
    const salesOnly = [records[0]];
    const props = {
      table: googleTable,
      records: salesOnly,
      previousRecords: undefined,
      level: "campaign" as const,
      woo: null,
      manualRoi: { readOnly: true },
    };
    const { rerender } = render(
      <AdsGoalTables {...props} showTrackingWarnings />,
    );
    expect(screen.getByText(/ערך המרות נמוך מהצפוי/)).toBeInTheDocument();
    rerender(<AdsGoalTables {...props} showTrackingWarnings={false} />);
    expect(screen.queryByText(/ערך המרות נמוך מהצפוי/)).toBeNull();
  });

  it("shows the previous period's columns while it is set", () => {
    render(
      <AdsGoalTables
        table={googleTable}
        records={records}
        previousRecords={[googleDay("search", "leads", { cost: 80 })]}
        level="campaign"
        woo={null}
        manualRoi={{ readOnly: true }}
        showTrackingWarnings={false}
      />,
    );
    expect(screen.getAllByText("תקופה קודמת").length).toBeGreaterThan(0);
  });
});
