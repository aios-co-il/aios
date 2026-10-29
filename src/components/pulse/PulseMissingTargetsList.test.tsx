import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PulseCampaignGoalRow } from "@/lib/pulseCampaignGoals";
import type { PlatformWithoutTarget } from "../../../supabase/functions/_shared/pulse/targets/missing.ts";
import { PulseMissingTargetsList } from "./PulseMissingTargetsList";

const group: PlatformWithoutTarget<PulseCampaignGoalRow> = {
  client_id: "client-1",
  platform: "google",
  spend_7d: 1200,
  campaigns: [
    {
      campaign_key: "k9",
      campaign_id: "g1",
      campaign_name: "PMax מכירות",
      table_id: "t9",
      goal: "ecommerce",
      spend_7d: 1200,
      efficiency_7d: 2.1,
    },
  ],
};

describe("PulseMissingTargetsList", () => {
  it("lists campaigns without a target and opens the editor for the client", () => {
    const onSetTargets = vi.fn();
    render(
      <PulseMissingTargetsList
        groups={[group]}
        clientMetaById={
          new Map([["client-1", { name: "חנות", campaignerName: "דנה" }]])
        }
        onOpenClient={() => {}}
        onSetTargets={onSetTargets}
      />,
    );
    expect(screen.getByText("PMax מכירות")).toBeTruthy();
    expect(screen.getByText("Google Ads")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /קבע יעדים/ }));
    expect(onSetTargets).toHaveBeenCalledWith(
      "client-1",
      "google",
      "ecommerce",
    );
  });

  it("skips clients outside the current filter", () => {
    render(
      <PulseMissingTargetsList
        groups={[group]}
        clientMetaById={new Map()}
        onOpenClient={() => {}}
        onSetTargets={vi.fn()}
      />,
    );
    expect(
      screen.getByText("לכל הקמפיינים עם הוצאה בטווח ובסינון שנבחרו יש יעד"),
    ).toBeTruthy();
  });
});
