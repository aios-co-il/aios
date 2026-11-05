import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { campaignRow } from "./campaignRowFixture";
import { CampaignTargetList } from "./CampaignTargetList";

describe("CampaignTargetList", () => {
  it("says when no lead or ecommerce campaign spent", () => {
    render(<CampaignTargetList rows={[]} savingKey={null} onSave={vi.fn()} />);
    expect(
      screen.getByText(
        "אין קמפייני לידים או איקומרס עם הוצאה ב־7 הימים האחרונים",
      ),
    ).toBeTruthy();
  });

  it("shows each campaign's goal, spend and current cost", () => {
    render(
      <CampaignTargetList
        rows={[
          {
            row: campaignRow(),
            goal: "leads",
            target: null,
            inherited: null,
            saveTo: { tableIds: ["t1"], campaignId: "c1" },
          },
        ]}
        savingKey={null}
        onSave={vi.fn()}
      />,
    );
    expect(
      screen.getByText("לידים · הוצאה 7 ימים ₪900 · נוכחי ₪75"),
    ).toBeTruthy();
  });
});
