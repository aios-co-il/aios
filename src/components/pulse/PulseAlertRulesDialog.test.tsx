import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PulseAlertRulesDialog } from "./PulseAlertRulesDialog";

const owner = vi.hoisted(() => ({ value: false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: owner.value, error: null }),
  },
}));
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "t1" }),
}));
vi.mock("@/components/pulse/manager-round/OpenFindingsList", () => ({
  OpenFindingsList: () => null,
}));

const SWITCH_LABEL = "תיעוד אוטומטי בכרטיס הלקוח של הודעות שנשלחו מהמערכת";

/** Renders the open dialog for a viewer the database does (or does not) treat as an owner; returns its onSave spy. */
function renderDialog(value: unknown, isOwner = false) {
  owner.value = isOwner;
  const onSave = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PulseAlertRulesDialog
        open
        onOpenChange={() => {}}
        value={value}
        onSave={onSave}
      />
    </QueryClientProvider>,
  );
  return onSave;
}

describe("PulseAlertRulesDialog manager mode", () => {
  it("lets an owner change Carmen's mode, starting from the stored one", async () => {
    const onSave = renderDialog({ manager: { mode: "david_only" } }, true);
    expect(
      await screen.findByRole("radio", { name: /רק לבעלים/ }),
    ).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: /צוות מלא/ }));
    await userEvent.click(screen.getByRole("button", { name: "שמור חוקים" }));
    expect(onSave.mock.calls[0][1]).toEqual({
      mode: "team",
      card_log_system_sends: false,
    });
  });

  it("hides the mode from others, whose save sends no manager change", async () => {
    const onSave = renderDialog({ manager: { mode: "team" } });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "שמור חוקים" }));
    expect(onSave.mock.calls[0][1]).toEqual({});
  });
});

describe("PulseAlertRulesDialog thresholds without a target", () => {
  it("lets a field be cleared while typing and never stores 0 for it", async () => {
    const onSave = renderDialog({
      manager: { cost: { trend_pct: 50, min_spend_7d: 400 } },
    });
    const trend = screen.getByLabelText("עליית CPL/CPA (%)");
    fireEvent.change(trend, { target: { value: "" } });
    expect(trend).toHaveDisplayValue(""); // no snap back to 40 while typing
    fireEvent.change(trend, { target: { value: "35" } });
    expect(trend).toHaveDisplayValue("35");

    const minSpend = screen.getByLabelText("הוצאה מינ׳ ב־7 ימים");
    fireEvent.change(minSpend, { target: { value: "" } });
    fireEvent.blur(minSpend);
    expect(minSpend).toHaveDisplayValue("400"); // leaving it empty restores the value

    fireEvent.click(screen.getByRole("button", { name: "שמור חוקים" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].manager.cost).toMatchObject({
      trend_pct: 35,
      min_spend_7d: 400,
    });
  });
});

describe("PulseAlertRulesDialog client card logging switch", () => {
  it("is shown to owners, off by default, and saved as a manager setting", async () => {
    const onSave = renderDialog(null, true);
    const toggle = await screen.findByRole("switch", { name: SWITCH_LABEL });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: "שמור חוקים" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][1]).toMatchObject({
      card_log_system_sends: true,
    });
  });

  it("starts from the stored value", async () => {
    renderDialog({ manager: { card_log_system_sends: true } }, true);
    expect(
      await screen.findByRole("switch", { name: SWITCH_LABEL }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("is hidden from non-owners, whose save sends no manager change", async () => {
    const onSave = renderDialog({ manager: { card_log_system_sends: true } });
    expect(screen.queryByText(SWITCH_LABEL)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "שמור חוקים" }));
    expect(onSave.mock.calls[0][1]).toEqual({});
  });
});
