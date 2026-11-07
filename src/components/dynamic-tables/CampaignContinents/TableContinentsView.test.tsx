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
    expect(screen.getAllByText("דרום אמריקה")).toHaveLength(2);
    expect(screen.getAllByText("אסיה")).toHaveLength(2);
    expect(screen.getAllByText("כללי")).toHaveLength(2);
    expect(screen.getAllByText("$560").length).toBeGreaterThan(0);
  });
});
