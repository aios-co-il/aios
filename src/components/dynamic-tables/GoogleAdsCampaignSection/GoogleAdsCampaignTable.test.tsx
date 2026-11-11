import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GoogleAdsCampaignTable } from "./GoogleAdsCampaignTable";
import { googleStoreTotals } from "./googleAdsTotals";
import type { GoogleAdsCampaignSummaryRow } from "./types";

/** A lead campaign of the summary with these figures. */
function campaign(
  name: string,
  data: Partial<GoogleAdsCampaignSummaryRow>,
): GoogleAdsCampaignSummaryRow {
  return {
    name,
    campaign_id: name,
    goal: "leads",
    off: false,
    impressions: 100,
    clicks: 10,
    spend: 50,
    conversions: 2,
    conversions_value: 0,
    ...data,
  };
}

/** A plain number rounded to two decimals. */
function format(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** The total row's cell texts. */
function totalRow(table: HTMLElement): Array<string | null> {
  return [...(table.querySelector("tfoot tr")?.children ?? [])].map(
    (cell) => cell.textContent,
  );
}

describe("GoogleAdsCampaignTable", () => {
  it("shows each campaign's state and recomputes the total without the switched-off ones", async () => {
    const user = userEvent.setup();
    const rows = [
      campaign("Search", { spend: 60, conversions: 3 }),
      campaign("Paused", { off: true, spend: 40, conversions: 1 }),
    ];
    const groupTotals = {
      impressions: 200,
      clicks: 20,
      spend: 100,
      conversions: 4,
      conversions_value: 0,
      leads: 0,
    };
    render(
      <GoogleAdsCampaignTable
        rows={rows}
        goal="leads"
        groupTotals={groupTotals}
        store={googleStoreTotals(groupTotals)}
        mixed={false}
        icon={null}
        formatCurrency={format}
        formatNumber={format}
        formatUnitCost={format}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByRole("img", { name: "כבוי" })).toBeTruthy();
    expect(totalRow(table).slice(-2)).toStrictEqual(["4", "25"]);
    await user.click(screen.getByRole("switch"));
    expect(within(table).queryByText("Paused")).toBeNull();
    expect(totalRow(table).slice(-2)).toStrictEqual(["3", "20"]);
  });
});
