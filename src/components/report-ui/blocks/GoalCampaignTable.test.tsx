import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReportCampaignRow, ReportScopeData } from "../data/reportData";
import {
  emptyReportFigures,
  type ReportFigures,
} from "../metrics/reportFigures";
import { formatCurrency } from "@/lib/currency";
import type { DashboardCurrencies } from "@/lib/dashboardCurrencies";
import {
  mixedCurrencies,
  singleCurrency,
} from "@/lib/dashboardCurrencies.test-fixture";
import { GoalCampaignTable } from "./GoalCampaignTable";

describe("GoalCampaignTable", () => {
  it("writes each platform's campaigns in its currency and the total apart", () => {
    renderTable(
      [
        campaign("f1", "facebook", { leads: 100, spend: 22142 }),
        campaign("g1", "google_ads", { leads: 10, spend: 300 }),
      ],
      undefined,
      mixedCurrencies(),
    );

    function cpl(name: string) {
      return screen.getByText(name).closest("tr")?.children[2]?.textContent;
    }
    expect(cpl("f1")).toBe(formatCurrency(221.42, "ILS"));
    expect(cpl("g1")).toBe(formatCurrency(30, "USD"));
    expect(cpl("סה״כ לידים")).toBe(
      `${formatCurrency(221.42, "ILS")} · ${formatCurrency(30, "USD")}`,
    );
  });

  it("lists Meta campaigns, then Google's, each with a subtotal", () => {
    renderTable([
      campaign("g1", "google_ads", { leads: 2, spend: 40 }),
      campaign("f1", "facebook", { leads: 5, spend: 100 }),
    ]);
    const names = rowNames();
    expect(names).toStrictEqual([
      "Meta",
      "f1",
      "סה״כ Meta",
      "Google",
      "g1",
      "סה״כ Google",
    ]);
  });

  it("compares each campaign with the previous period while it is set", () => {
    renderTable(
      [campaign("f1", "facebook", { leads: 5, spend: 100 })],
      [campaign("f1", "facebook", { leads: 2, spend: 100 })],
    );
    const heads = screen
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(heads).toStrictEqual([
      "קמפיין",
      "לידים",
      "תקופה קודמת",
      "עלות לליד (CPL)",
      "תקופה קודמת",
    ]);
    const cells = screen.getByText("f1").closest("tr")?.children ?? [];
    // Leads went up from 2: the current value carries the up arrow and green.
    expect(cells[1]?.textContent).toBe("▲ 5");
    expect(cells[1]?.className).toContain("text-green-600");
    expect(cells[2]?.textContent).toBe("2");
    expect(cells[2]?.className).not.toContain("text-green-600");
    expect(cells[2]?.className).toContain("text-muted-foreground");
    // Cost per lead fell from 50 to 20: good news, marked on the current value.
    expect(cells[3]?.textContent).toMatch(/^▼ /);
    expect(cells[3]?.className).toContain("text-green-600");
    expect(cells[4]?.textContent).not.toMatch(/[▲▼]/);
  });

  it("marks a fall in leads in red on the current value", () => {
    renderTable(
      [campaign("f1", "facebook", { leads: 2, spend: 100 })],
      [campaign("f1", "facebook", { leads: 5, spend: 100 })],
    );

    const cells = screen.getByText("f1").closest("tr")?.children ?? [];
    expect(cells[1]?.textContent).toBe("▼ 2");
    expect(cells[1]?.className).toContain("text-red-600");
    expect(cells[2]?.textContent).toBe("5");
    expect(cells[2]?.className).not.toContain("text-red-600");
  });

  it("leaves a campaign that did not run then unmarked", () => {
    renderTable(
      [campaign("f1", "facebook", { leads: 5, spend: 100 })],
      [campaign("other", "facebook", { leads: 2, spend: 100 })],
    );

    const cells = screen.getByText("f1").closest("tr")?.children ?? [];
    expect(cells[1]?.textContent).toBe("5");
    expect(cells[2]?.textContent).toBe("—");
  });

  it("leaves a cost per lead without leads unmarked", () => {
    renderTable(
      [campaign("f1", "facebook", { leads: 0, spend: 100 })],
      [campaign("f1", "facebook", { leads: 5, spend: 100 })],
    );

    const cells = screen.getByText("f1").closest("tr")?.children ?? [];
    // No leads now means no cost per lead to compare with the previous 20.
    expect(cells[3]?.textContent).not.toMatch(/[▲▼]/);
    expect(cells[3]?.className).not.toContain("text-green-600");
    expect(cells[4]?.textContent).toBe(formatCurrency(20, "ILS"));
  });
});

/** Renders a leads table over these campaigns, and their previous period. */
function renderTable(
  campaigns: Array<ReportCampaignRow>,
  previous?: Array<ReportCampaignRow>,
  currencies: DashboardCurrencies = singleCurrency(),
) {
  const scope: ReportScopeData = {
    figures: emptyReportFigures(),
    previous: null,
    previousCampaigns: previous ?? null,
    channels: [],
    daily: [],
    dailyByChannel: [],
    campaigns,
  };
  render(
    <GoalCampaignTable
      goal="leads"
      scope={scope}
      metrics={["leads", "cpl"]}
      currencies={currencies}
    />,
  );
}

/** A campaign row with these figures. */
function campaign(
  name: string,
  channel: ReportCampaignRow["channel"],
  fields: Partial<ReportFigures>,
): ReportCampaignRow {
  return {
    key: `${channel}:${name}`,
    name,
    channel,
    on: true,
    figures: { ...emptyReportFigures(), ...fields },
  };
}

/** The first cell of each body row. */
function rowNames(): Array<string> {
  const body = screen.getAllByRole("rowgroup")[1];
  return within(body)
    .getAllByRole("row")
    .map((row) => row.children[0]?.textContent ?? "");
}
