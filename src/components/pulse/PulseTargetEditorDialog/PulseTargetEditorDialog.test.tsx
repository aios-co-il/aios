import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { campaignRow } from "./campaignRowFixture";
import { PulseTargetEditorDialog } from "./PulseTargetEditorDialog";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

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
        campaigns={[campaignRow()]}
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
    expect(screen.getByRole("button", { name: "שמור יעד" })).toBeDisabled();
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
          campaignRow({
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

  it("breaks a platform target tie between duplicate Meta tables like the pulse", () => {
    // Legacy CPL on both tables; a lead goal reads best from the insights table,
    // even though the ecommerce table has the lower id and comes first.
    render(
      <PulseTargetEditorDialog
        open
        onOpenChange={() => {}}
        context={{
          clientId: "client-1",
          clientName: "שיפוצי אבי",
          platform: "meta",
          primaryGoal: "leads",
          platformTableIds: ["t-a", "t-b"],
        }}
        campaigns={[]}
        tableSettingsById={
          new Map([
            ["t-a", { target_cpl: 60 }],
            ["t-b", { target_cpl: 80 }],
          ])
        }
        tableTypeById={
          new Map([
            ["t-a", "facebook_ecommerce"],
            ["t-b", "facebook_insights"],
          ])
        }
        savingKey={null}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText(/₪80 \(מהגדרות הדוח\)/)).toBeTruthy();
    expect(screen.queryByText(/₪60/)).toBeNull();
  });
});
