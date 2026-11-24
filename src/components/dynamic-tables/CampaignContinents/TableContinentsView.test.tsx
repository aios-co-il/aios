import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TableContinentsView } from "./TableContinentsView";

const row = (campaign_id: string, campaign_name: string, cost: number) => ({
  data: {
    date: "2026-11-05",
    entity_level: "campaign",
    campaign_id,
    campaign_name,
    cost,
    clicks: 10,
    impressions: 100,
    conversions: 1,
  },
});

describe("TableContinentsView", () => {
  it("groups the table's own campaigns by continent, in its currency", () => {
    render(
      <TableContinentsView
        records={[
          row("1", "טיול לפטגוניה - Pmax", 560),
          row("2", "טיול ליפן בפריחת הדובדבן - Pmax", 360),
          row("3", "טיולי חורף - Pmax", 668),
        ]}
        table={{
          id: "echo",
          integration_type: "google_ads",
          integration_settings: { campaign_type: "leads", currency: "USD" },
        }}
      />,
    );
    expect(screen.getByText("סיכום לפי יבשת")).toBeTruthy();
    expect(screen.getAllByText("אמריקה")).toHaveLength(2);
    expect(screen.getAllByText("אסיה")).toHaveLength(2);
    expect(screen.getAllByText("כללי")).toHaveLength(2);
    expect(screen.getAllByText("$560").length).toBeGreaterThan(0);
  });

  it("groups a Facebook table's campaigns by continent, in its currency", () => {
    function meta(campaign_id: string, campaign_name: string, spend: number) {
      return {
        data: {
          date: "2026-11-05",
          entity_level: "campaign",
          campaign_id,
          campaign_name,
          campaign_type: "lead",
          result_kind: "leads",
          spend,
          clicks: 10,
          impressions: 100,
          leads: 2,
        },
      };
    }

    render(
      <TableContinentsView
        records={[
          meta("1", "טיול לפטגוניה | לידים", 1200),
          meta("2", "טיול ליפן | לידים", 800),
        ]}
        table={{
          id: "eco-meta",
          integration_type: "facebook_insights",
          integration_settings: { currency: "ILS" },
        }}
      />,
    );

    expect(screen.getByText("סיכום לפי יבשת")).toBeTruthy();
    expect(screen.getByText("אמריקה - Facebook לידים")).toBeTruthy();
    expect(screen.getAllByText(/₪/).length).toBeGreaterThan(0);
  });
});
