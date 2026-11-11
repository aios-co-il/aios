import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { formatCurrency, formatUnitCost } from "@/lib/currency";
import {
  dashboardFacebookCampaigns,
  dashboardRecordGoalOf,
} from "@/lib/dashboardCampaignGoals";
import { FacebookReportTab } from "./FacebookReportTab";

/** One day of a Facebook campaign, as a dashboard tags its records. */
function day(campaign: string, data: Record<string, unknown>) {
  return {
    _source: "facebook_insights",
    _tableId: "fb",
    data: {
      date: "2026-10-20",
      campaign_id: campaign,
      campaign_name: campaign,
      entity_level: "campaign",
      impressions: 1000,
      clicks: 50,
      ...data,
    },
  };
}

type DayRecord = ReturnType<typeof day>;

const TABLES = [
  { id: "fb", integration_type: "facebook_insights", integration_settings: {} },
];

/** Renders the tab as a dashboard builds it from these records. */
function renderTab(
  records: Array<DayRecord>,
  previousRecords?: Array<DayRecord>,
) {
  const campaigns = dashboardFacebookCampaigns(
    records,
    dashboardRecordGoalOf(records, TABLES),
  );
  const previous = previousRecords
    ? dashboardFacebookCampaigns(
        previousRecords,
        dashboardRecordGoalOf(previousRecords, TABLES),
      )
    : null;
  render(
    <FacebookReportTab
      campaigns={campaigns}
      records={records}
      tables={TABLES}
      previous={previous}
      formatCurrency={(value) => formatCurrency(value, "ILS")}
      formatUnitCost={(value) => formatUnitCost(value, "ILS")}
      formatNumber={(value) => String(Math.round(value))}
    />,
  );
}

/** A headline card by its label (tables reuse some labels as headers). */
function kpiCard(label: string): HTMLElement {
  const title = screen
    .getAllByText(label)
    .find((element) => element.tagName === "SPAN");
  return title?.closest("div")?.parentElement as HTMLElement;
}

/** A table by its section title. */
function tableOf(title: string): HTMLElement {
  const section = screen.getByText(title).closest("section");
  return within(section as HTMLElement).getByRole("table");
}

/** A row's cell texts, without the bidi marks and no-break spaces of he-IL. */
function rowTexts(table: HTMLElement, name: string): Array<string> {
  const cells = within(table).getByText(name).closest("tr")?.children ?? [];
  return [...cells].map((cell) =>
    (cell.textContent ?? "").replace(/\u200f/g, "").replace(/\u00a0/g, " "),
  );
}

/** A campaign row's figures, after its name cell. */
function figures(table: HTMLElement, name: string): Array<string> {
  return rowTexts(table, name).slice(1);
}

/** The table's column heads. */
function heads(table: HTMLElement): Array<string | null> {
  return within(table)
    .getAllByRole("columnheader")
    .map((cell) => cell.textContent);
}

describe("FacebookReportTab", () => {
  it("measures purchases that carry no value by cost per purchase, like leads", () => {
    renderTab([
      day("Gift course", {
        campaign_type: "ecommerce",
        spend: 336,
        purchases: 15,
      }),
    ]);
    const table = tableOf("קמפיינים איקומרס - Facebook");
    expect(heads(table)).not.toContain("ROAS");
    expect(heads(table)).toContain("עלות לרכישה");
    expect(figures(table, "Gift course").slice(-3)).toStrictEqual([
      "0",
      "15",
      "22 ₪",
    ]);
  });

  it("keeps purchase value and ROAS for campaigns that sell with value", () => {
    renderTab([
      day("Shop", {
        campaign_type: "ecommerce",
        spend: 100,
        purchases: 4,
        purchase_value: 500,
      }),
      day("Gift course", {
        campaign_type: "ecommerce",
        spend: 336,
        purchases: 15,
      }),
    ]);
    const table = tableOf("קמפיינים איקומרס - Facebook");
    expect(figures(table, "Shop").slice(-1)).toStrictEqual(["5.00x"]);
    // Purchases without value get a dash, not a ROAS of 0.
    expect(figures(table, "Gift course").slice(-1)).toStrictEqual(["-"]);
  });

  it("shows a profile campaign's new followers and cost per follower, with a total", () => {
    renderTab([
      day("Profile", {
        campaign_type: "traffic",
        destination_type: "INSTAGRAM_PROFILE",
        spend: 12,
        new_followers: 30,
      }),
      day("Blog", { campaign_type: "traffic", spend: 300 }),
    ]);
    const table = tableOf("קמפיינים טראפיק - Facebook");
    expect(heads(table).slice(-2)).toStrictEqual([
      "עוקבים חדשים",
      "עלות לעוקב",
    ]);
    expect(figures(table, "Profile").slice(-2)).toStrictEqual(["30", "0.40 ₪"]);
    const total = rowTexts(table, "סה״כ");
    expect(total.slice(-2)).toStrictEqual(["30", "0.40 ₪"]);
  });

  it("shows each campaign's Meta state and hides the switched-off ones on request", async () => {
    const user = userEvent.setup();
    renderTab([
      day("On", {
        campaign_type: "traffic",
        spend: 10,
        effective_status: "ACTIVE",
      }),
      day("Off", {
        campaign_type: "traffic",
        spend: 5,
        effective_status: "PAUSED",
      }),
    ]);
    const table = tableOf("קמפיינים טראפיק - Facebook");
    expect(within(table).getByRole("img", { name: "כבוי" })).toBeTruthy();
    await user.click(screen.getByRole("switch"));
    expect(within(table).queryByText("Off")).toBeNull();
    expect(within(table).getByText("On")).toBeTruthy();
  });

  it("shows each headline figure's change against the previous period", () => {
    renderTab(
      [day("A", { spend: 120, clicks: 60 })],
      [day("A", { spend: 100, clicks: 50 })],
    );
    expect(within(kpiCard("הוצאה כוללת")).getByText("+20%")).toBeVisible();
    // Impressions held at 1000 in both periods.
    expect(within(kpiCard("חשיפות")).getByText("0%")).toBeVisible();
  });

  it("shows no change while the comparison is off", () => {
    renderTab([day("A", { spend: 120 })]);
    expect(screen.queryByText(/^[+−]\d+%$/)).toBeNull();
  });
});
