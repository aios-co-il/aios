import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReportCampaignRow, ReportScopeData } from "../data/reportData";
import {
  emptyReportFigures,
  type ReportFigures,
} from "../metrics/reportFigures";
import { GoalCampaignTable } from "./GoalCampaignTable";

describe("GoalCampaignTable", () => {
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
    // Leads went up from 2: the previous value with an up arrow.
    expect(cells[2]?.textContent).toBe("▲ 2");
  });
});

/** Renders a leads table over these campaigns, and their previous period. */
function renderTable(
  campaigns: Array<ReportCampaignRow>,
  previous?: Array<ReportCampaignRow>,
) {
  const scope: ReportScopeData = {
    figures: emptyReportFigures(),
    previous: null,
    previousCampaigns: previous ?? null,
    channels: [],
    daily: [],
    campaigns,
  };
  render(
    <GoalCampaignTable
      goal="leads"
      scope={scope}
      metrics={["leads", "cpl"]}
      currency="ILS"
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
