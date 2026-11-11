import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReportCampaignRow, ReportScopeData } from "../data/reportData";
import {
  emptyReportFigures,
  type ReportFigures,
} from "../metrics/reportFigures";
import { GoalCampaignTable } from "./GoalCampaignTable";

function figures(fields: Partial<ReportFigures>): ReportFigures {
  return { ...emptyReportFigures(), ...fields };
}

function campaign(
  key: string,
  fields: Partial<ReportFigures>,
): ReportCampaignRow {
  return {
    key,
    name: key,
    channel: "facebook",
    on: true,
    figures: figures(fields),
  };
}

function scopeOf(
  campaigns: Array<ReportCampaignRow>,
  previousCampaigns: ReportScopeData["previousCampaigns"],
): ReportScopeData {
  return {
    figures: figures({}),
    previous: null,
    previousCampaigns,
    channels: [],
    daily: [],
    campaigns,
  };
}

/** A row's text by its campaign name. */
function rowOf(name: string): HTMLElement {
  return screen.getByTitle(name).closest("tr") as HTMLElement;
}

describe("GoalCampaignTable", () => {
  it("shows each campaign's previous value under its cell while comparing", () => {
    render(
      <GoalCampaignTable
        goal="leads"
        metrics={["leads"]}
        currency="ILS"
        scope={scopeOf(
          [campaign("A", { leads: 12 }), campaign("B", { leads: 3 })],
          new Map([["A", figures({ leads: 8 })]]),
        )}
      />,
    );
    const a = within(rowOf("A")).getByTitle("תקופה קודמת");
    expect(a).toHaveTextContent("▲ 8");
    // B did not run in the previous period.
    expect(
      within(rowOf("B")).getByTitle("לא נמדד בתקופה הקודמת"),
    ).toBeVisible();
  });

  it("shows no previous values while the comparison is off", () => {
    render(
      <GoalCampaignTable
        goal="leads"
        metrics={["leads"]}
        currency="ILS"
        scope={scopeOf([campaign("A", { leads: 12 })], null)}
      />,
    );
    expect(screen.queryByTitle("תקופה קודמת")).toBeNull();
  });
});
