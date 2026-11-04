import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CampaignOffBadge } from "./CampaignOffBadge";

describe("CampaignOffBadge", () => {
  it("shows כבוי for an off campaign", () => {
    render(<CampaignOffBadge off />);
    expect(screen.getByText("כבוי")).toBeTruthy();
  });

  it("renders nothing for a campaign that is on", () => {
    const { container } = render(<CampaignOffBadge off={false} />);
    expect(container.textContent).toBe("");
  });
});
