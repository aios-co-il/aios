import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PulseCampaignGoalRow } from "@/lib/pulseCampaignGoals";
import { PulseTargetEditorDialog } from "./PulseTargetEditorDialog";
import { PulseMissingTargetsList } from "./PulseMissingTargetsList";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

function campaign(
  over: Partial<PulseCampaignGoalRow> = {},
): PulseCampaignGoalRow {
  return {
    campaign_key: "k1",
    campaign_id: "c1",
    campaign_name: "לידים שיפוץ",
    client_id: "client-1",
    table_id: "t1",
    platform: "meta",
    goal: "leads",
    classification_source: "platform_goal",
    outcome_kind: "leads",
    status: "critical",
    status_tier: "exception",
    status_reason: "",
    alert_eligible: true,
    target_value: null,
    target_kind: null,
    spend_3d: 300,
    outcomes_3d: 4,
    efficiency_3d: 75,
    spend_7d: 900,
    outcomes_7d: 12,
    revenue_7d: 0,
    efficiency_7d: 75,
    baseline_efficiency_3d: 50,
    baseline_efficiency_7d: 50,
    trend_3d_pct: 50,
    trend_7d_pct: 50,
    impressions_7d: 0,
    reach_7d: 0,
    frequency_7d: null,
    spend_today: 0,
    outcomes_today: null,
    revenue_today: 0,
    efficiency_today: null,
    data_fresh_through: null,
    last_change_at: null,
    last_sync_at: null,
    partial_today_excluded: true,
    today_partial_included: false,
    ...over,
  };
}

describe("PulseTargetEditorDialog", () => {
  it("shows Carmen's market target with its rationale and saves it as approved", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <PulseTargetEditorDialog
        open
        onOpenChange={() => {}}
        context={{
          clientId: "client-1",
          clientName: "שיפוצי אבי",
          platform: "meta",
          primaryGoal: "leads",
          platformTableIds: ["t1"],
        }}
        campaigns={[campaign()]}
        tableSettingsById={
          new Map([
            [
              "t1",
              {
                pulse_targets: {
                  c1: {
                    cpl: 60,
                    source: "carmen_market",
                    rationale: "ענף שיפוצים ₪50–70; הלקוח ₪52",
                  },
                },
              },
            ],
          ])
        }
        savingKey={null}
        onSave={onSave}
      />,
    );

    expect(screen.getAllByText("יעד שוק (כרמן)").length).toBeGreaterThan(0);
    expect(screen.getByText(/נימוק כרמן/)).toBeTruthy();
    // The platform has no target of its own.
    expect(screen.getByText("אין יעד")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "אשר כיעד מאושר" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      tableIds: ["t1"],
      goal: "leads",
      kind: "cpl",
      value: 60,
      campaignId: "c1",
      campaignName: "לידים שיפוץ",
    });
  });

  it("saves a platform target to every table of the platform", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <PulseTargetEditorDialog
        open
        onOpenChange={() => {}}
        context={{
          clientId: "client-1",
          clientName: "חנות",
          platform: "google",
          primaryGoal: "leads",
          platformTableIds: ["g1", "g2"],
        }}
        campaigns={[]}
        tableSettingsById={new Map()}
        savingKey={null}
        onSave={onSave}
      />,
    );
    const [platformInput] = screen.getAllByPlaceholderText("לדוגמה: 90");
    fireEvent.change(platformInput, { target: { value: "70" } });
    fireEvent.click(screen.getByRole("button", { name: "שמור יעד" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      tableIds: ["g1", "g2"],
      goal: "leads",
      kind: "cpl",
      value: 70,
    });
  });

  it("shows a report-settings target as inherited instead of offering a no-op remove", () => {
    render(
      <PulseTargetEditorDialog
        open
        onOpenChange={() => {}}
        context={{
          clientId: "client-1",
          clientName: "שיפוצי אבי",
          platform: "meta",
          primaryGoal: "leads",
          platformTableIds: ["t1"],
        }}
        campaigns={[]}
        tableSettingsById={new Map([["t1", { target_cpl: 80 }]])}
        savingKey={null}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText(/\(מהגדרות הדוח\)/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "הסר יעד" })).toBeNull();
    expect(
      (screen.getByRole("button", { name: "שמור יעד" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("edits the target the pulse found on a duplicate table where it is stored", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <PulseTargetEditorDialog
        open
        onOpenChange={() => {}}
        context={{
          clientId: "client-1",
          clientName: "שיפוצי אבי",
          platform: "meta",
          primaryGoal: "leads",
          platformTableIds: ["t1", "t2"],
        }}
        campaigns={[
          campaign({
            target_value: 60,
            target_kind: "cpl",
            target_source: "carmen_market",
            target_scope: "campaign",
            target_table_id: "t2",
            target_campaign_id: "c2",
            target_rationale: "ענף שיפוצים ₪50–70; הלקוח ₪52",
          }),
        ]}
        tableSettingsById={new Map([["t1", {}]])}
        savingKey={null}
        onSave={onSave}
      />,
    );
    expect(screen.getByText(/נימוק כרמן/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "אשר כיעד מאושר" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      tableIds: ["t2"],
      goal: "leads",
      kind: "cpl",
      value: 60,
      campaignId: "c2",
      campaignName: "לידים שיפוץ",
    });
  });
});

describe("PulseMissingTargetsList", () => {
  it("lists campaigns without a target and opens the editor for the client", () => {
    const onSetTargets = vi.fn();
    render(
      <PulseMissingTargetsList
        groups={[
          {
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
          },
        ]}
        clientMetaById={
          new Map([["client-1", { name: "חנות", campaignerName: "דנה" }]])
        }
        onOpenClient={() => {}}
        onSetTargets={onSetTargets}
      />,
    );
    expect(screen.getByText("PMax מכירות")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /קבע יעדים/ }));
    expect(onSetTargets).toHaveBeenCalledWith(
      "client-1",
      "google",
      "ecommerce",
    );
  });
});
