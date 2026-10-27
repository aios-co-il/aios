import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeeklyCampaignComparison } from "./WeeklyCampaignComparison";

const fb = (campaign: string, data: Record<string, unknown>) => ({
  _source: "facebook_insights",
  data: {
    date: "2026-09-14",
    campaign_id: campaign,
    campaign_name: campaign,
    entity_level: "campaign",
    impressions: 1000,
    clicks: 50,
    ...data,
  },
});
const leads = (campaign: string, spend: number, count: number) =>
  fb(campaign, { campaign_type: "lead", spend, leads: count });
const shop = (campaign: string, spend: number, purchases: number) =>
  fb(campaign, {
    campaign_type: "ecommerce",
    spend,
    purchases,
    purchase_value: spend * 4,
  });

const headers = (region: HTMLElement) =>
  within(region)
    .getAllByRole("columnheader")
    .map((cell) => cell.textContent);
const footer = (region: HTMLElement) =>
  [...region.querySelectorAll("tfoot td")].map((cell) => cell.textContent);

describe("weekly comparison by campaign goal", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-18T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("a lead-only week has no revenue or ROAS columns", () => {
    render(
      <WeeklyCampaignComparison
        records={[leads("Leads A", 100, 5), leads("Leads B", 60, 3)]}
      />,
    );
    const region = screen.getByRole("region", { name: "קמפייני לידים" });
    expect(headers(region)).toStrictEqual([
      "קמפיין",
      "חשיפות",
      "קליקים",
      "לידים",
      "הוצאה",
      "עלות לליד",
    ]);
    expect(footer(region)).toStrictEqual([
      "סה״כ שבועי",
      "2,000",
      "100",
      "8",
      "₪160",
      "₪20",
    ]);
    expect(screen.queryByText("הכנסה")).toBeNull();
    expect(screen.queryByText("ROAS")).toBeNull();
    // One goal: no sub-heading and no cross-goal spend line.
    expect(screen.queryByRole("heading", { name: "קמפייני לידים" })).toBeNull();
    expect(screen.queryByText("הוצאה כוללת בשבוע (כל היעדים)")).toBeNull();
    expect(screen.getByText("שבוע נוכחי · נתונים חלקיים")).toBeTruthy();
  });

  it("an ecommerce-only week shows every sales column", () => {
    render(<WeeklyCampaignComparison records={[shop("Shop", 200, 4)]} />);
    const region = screen.getByRole("region", { name: "קמפייני מכירות" });
    expect(headers(region)).toStrictEqual([
      "קמפיין",
      "חשיפות",
      "קליקים",
      "רכישות",
      "הוצאה",
      "עלות לרכישה",
      "הכנסה",
      "ROAS",
    ]);
    expect(footer(region)).toStrictEqual([
      "סה״כ שבועי",
      "1,000",
      "50",
      "4",
      "₪200",
      "₪50",
      "₪800",
      "4x",
    ]);
    expect(screen.queryByText("לידים")).toBeNull();
  });

  it("a mixed week shows a sales table and a leads table, each with its own totals", () => {
    render(
      <WeeklyCampaignComparison
        records={[leads("Leads", 300, 10), shop("Shop", 200, 4)]}
      />,
    );
    const regions = screen.getAllByRole("region");
    expect(regions.map((region) => region.getAttribute("aria-label"))).toEqual([
      "קמפייני מכירות",
      "קמפייני לידים",
    ]);
    const [sales, leadGroup] = regions;

    expect(within(sales).getByText("Shop")).toBeTruthy();
    expect(within(sales).queryByText("Leads")).toBeNull();
    expect(footer(sales)).toStrictEqual([
      "סה״כ מכירות",
      "1,000",
      "50",
      "4",
      "₪200",
      "₪50",
      "₪800",
      "4x",
    ]);

    expect(within(leadGroup).getByText("Leads")).toBeTruthy();
    expect(headers(leadGroup)).not.toContain("הכנסה");
    expect(headers(leadGroup)).not.toContain("ROAS");
    expect(within(leadGroup).queryByText(/^[\d.]+x$/)).toBeNull();
    expect(within(leadGroup).queryByText("—")).toBeNull();
    expect(footer(leadGroup)).toStrictEqual([
      "סה״כ לידים",
      "1,000",
      "50",
      "10",
      "₪300",
      "₪30",
    ]);

    // Spend across goals is labelled; results are never added across goals.
    expect(screen.queryByText("סה״כ שבועי")).toBeNull();
    const combined = screen.getByText("הוצאה כוללת בשבוע (כל היעדים)");
    expect(combined.parentElement?.textContent).toContain("₪500");
  });

  it("traffic campaigns are grouped last with clicks and cost per click", () => {
    render(
      <WeeklyCampaignComparison
        records={[
          fb("Traffic", { campaign_type: "traffic", spend: 50, clicks: 200 }),
          leads("Leads", 100, 5),
        ]}
      />,
    );
    const regions = screen.getAllByRole("region");
    expect(regions.map((region) => region.getAttribute("aria-label"))).toEqual([
      "קמפייני לידים",
      "קמפייני תנועה",
    ]);
    const traffic = regions[1];
    expect(headers(traffic)).toStrictEqual([
      "קמפיין",
      "חשיפות",
      "קליקים",
      "הוצאה",
      "עלות לקליק",
    ]);
    expect(footer(traffic)).toStrictEqual([
      "סה״כ תנועה",
      "1,000",
      "200",
      "₪50",
      "₪0.25",
    ]);
  });

  it("a legacy CONVERSIONS lead campaign keeps its leads and gets no sales columns", () => {
    for (const sourceModes of [
      undefined,
      { facebook_insights: "ecommerce" as const },
    ]) {
      const { unmount } = render(
        <WeeklyCampaignComparison
          records={[
            fb("LegacyLead", {
              campaign_type: "lead",
              campaign_objective: "CONVERSIONS",
              spend: 100,
              leads: 5,
            }),
          ]}
          sourceModes={sourceModes}
        />,
      );
      const region = screen.getByRole("region", { name: "קמפייני לידים" });
      expect(within(region).getByText("LegacyLead")).toBeTruthy();
      expect(footer(region)).toStrictEqual([
        "סה״כ שבועי",
        "1,000",
        "50",
        "5",
        "₪100",
        "₪20",
      ]);
      expect(
        screen.queryByRole("region", { name: "קמפייני מכירות" }),
      ).toBeNull();
      expect(screen.queryByText("הכנסה")).toBeNull();
      expect(screen.queryByText("ROAS")).toBeNull();
      unmount();
    }
  });

  it("keeps the platform column when the report has more than one platform", () => {
    render(
      <WeeklyCampaignComparison
        records={[
          leads("Leads", 100, 5),
          {
            _source: "google_ads",
            data: {
              date: "2026-09-14",
              campaign_id: "g",
              campaign_name: "Search",
              cost: 80,
              conversions: 4,
            },
          },
        ]}
        sourceModes={{ google_ads: "leads" }}
      />,
    );
    const region = screen.getByRole("region", { name: "קמפייני לידים" });
    expect(headers(region)[0]).toBe("פלטפורמה");
    expect(within(region).getByText("Google Ads")).toBeTruthy();
    expect(within(region).getByText("Facebook")).toBeTruthy();
  });
});
