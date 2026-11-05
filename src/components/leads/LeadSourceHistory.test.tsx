import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LeadSourceHistory } from "./LeadSourceHistory";

vi.mock("@/hooks/useLeadSourceEvents", () => ({
  useLeadSourceEvents: () => ({
    data: [
      {
        id: "2",
        source: "Facebook Ads",
        campaign_name: "מבצע",
        received_at: "2026-10-22T11:45:00.000Z",
      },
      {
        id: "1",
        source: "FB",
        campaign_name: null,
        received_at: "2026-10-13T21:13:28.000Z",
      },
    ],
  }),
}));

test("the timeline shows each arrival's source as it was sent", () => {
  render(<LeadSourceHistory leadId="lead-1" />);
  expect(screen.getByText("Facebook Ads")).toBeInTheDocument();
  expect(screen.getByText("FB")).toBeInTheDocument();
  expect(screen.queryByText("paid_ads")).not.toBeInTheDocument();
});
