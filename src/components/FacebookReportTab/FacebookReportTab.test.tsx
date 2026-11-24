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
function renderTab(records: Array<DayRecord>, previous?: Array<DayRecord>) {
  render(
    <FacebookReportTab
      campaigns={campaignsOf(records)}
      records={records}
      tables={TABLES}
      previous={previous ? campaignsOf(previous) : null}
      formatCurrency={(value) => formatCurrency(value, "ILS")}
      formatUnitCost={(value) => formatUnitCost(value, "ILS")}
      formatNumber={(value) => String(Math.round(value))}
    />,
  );
}

/** The tab's campaigns by goal, as the dashboard groups them. */
function campaignsOf(records: Array<DayRecord>) {
  return dashboardFacebookCampaigns(
    records,
    dashboardRecordGoalOf(records, TABLES),
  );
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

/** A row's cells, its name cell first. */
function cellsOf(table: HTMLElement, name: string): Array<Element> {
  return [...(within(table).getByText(name).closest("tr")?.children ?? [])];
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

  it("compares each campaign and the total with the previous period", () => {
    renderTab(
      [
        day("Leads", { campaign_type: "leads", spend: 100, leads: 10 }),
        day("New", { campaign_type: "leads", spend: 50, leads: 1 }),
      ],
      [day("Leads", { campaign_type: "leads", spend: 100, leads: 5 })],
    );
    const table = tableOf("קמפיינים לידים - Facebook");
    expect(heads(table)).toStrictEqual([
      "קמפיין",
      "חשיפות",
      "קליקים",
      "תקופה קודמת",
      "לידים",
      "תקופה קודמת",
      "הוצאה",
      "תקופה קודמת",
      "עלות לליד",
      "תקופה קודמת",
    ]);
    // Leads went up from 5 and cost per lead down from 20: both good news,
    // marked on the current values; the previous values stay plain.
    const leads = figures(table, "Leads");
    expect(leads[3]).toBe("▲ 10");
    expect(leads[4]).toBe("5");
    expect(leads[7]).toBe("▼ 10 ₪");
    expect(leads[8]).toBe("20 ₪");
    const cells = cellsOf(table, "Leads");
    expect(cells[4]?.className).toContain("text-green-600");
    expect(cells[5]?.className).not.toContain("text-green-600");
    expect(cells[8]?.className).toContain("text-green-600");
    // A campaign that did not run then has no previous value and no mark.
    expect(figures(table, "New")[3]).toBe("1");
    expect(figures(table, "New")[4]).toBe("—");
  });
});
