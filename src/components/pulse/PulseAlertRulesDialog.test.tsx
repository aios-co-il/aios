import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PulseAlertRulesDialog } from "./PulseAlertRulesDialog";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: null }),
}));

const SWITCH_LABEL = "תיעוד אוטומטי בכרטיס הלקוח של הודעות שנשלחו מהמערכת";

function renderDialog(value: unknown, canManageManager?: boolean) {
  const onSave = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PulseAlertRulesDialog
        open
        onOpenChange={() => {}}
        value={value}
        onSave={onSave}
        canManageManager={canManageManager}
      />
    </QueryClientProvider>,
  );
  return onSave;
}

describe("PulseAlertRulesDialog manager mode", () => {
  it("lets an owner change Carmen's mode, starting from the stored one", async () => {
    const onSave = renderDialog({ manager: { mode: "david_only" } }, true);
    expect(screen.getByRole("radio", { name: /רק לבעלים/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
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

describe("PulseAlertRulesDialog client card logging switch", () => {
  it("is shown to owners, off by default, and saved as a manager setting", async () => {
    const onSave = renderDialog(null, true);
    const toggle = screen.getByRole("switch", { name: SWITCH_LABEL });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: "שמור חוקים" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][1]).toMatchObject({
      card_log_system_sends: true,
    });
  });

  it("starts from the stored value", () => {
    renderDialog({ manager: { card_log_system_sends: true } }, true);
    expect(screen.getByRole("switch", { name: SWITCH_LABEL })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("is hidden from non-owners, whose save sends no manager change", async () => {
    const onSave = renderDialog({ manager: { card_log_system_sends: true } });
    expect(screen.queryByText(SWITCH_LABEL)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "שמור חוקים" }));
    expect(onSave.mock.calls[0][1]).toEqual({});
  });
});
