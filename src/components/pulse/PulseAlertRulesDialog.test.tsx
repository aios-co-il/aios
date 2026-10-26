import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PulseAlertRulesDialog } from "./PulseAlertRulesDialog";

const SWITCH_LABEL = "תיעוד אוטומטי בכרטיס הלקוח של הודעות שנשלחו מהמערכת";

function renderDialog(props: {
  value: unknown;
  canManageCardLog?: boolean;
  onSave?: ReturnType<typeof vi.fn>;
}) {
  const onSave = props.onSave ?? vi.fn();
  render(
    <PulseAlertRulesDialog
      open
      onOpenChange={() => {}}
      value={props.value}
      onSave={onSave}
      canManageCardLog={props.canManageCardLog}
    />,
  );
  return onSave;
}

describe("PulseAlertRulesDialog client card logging switch", () => {
  it("is shown to owners, off by default, and saved as a manager setting", async () => {
    const onSave = renderDialog({ value: null, canManageCardLog: true });
    const toggle = screen.getByRole("switch", { name: SWITCH_LABEL });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: "שמור חוקים" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][1]).toEqual({ card_log_system_sends: true });
  });

  it("starts from the stored value", () => {
    renderDialog({
      value: { manager: { card_log_system_sends: true } },
      canManageCardLog: true,
    });
    expect(screen.getByRole("switch", { name: SWITCH_LABEL })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("is hidden from non-owners, whose save sends no manager change", async () => {
    const onSave = renderDialog({
      value: { manager: { card_log_system_sends: true } },
    });
    expect(screen.queryByText(SWITCH_LABEL)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "שמור חוקים" }));
    expect(onSave.mock.calls[0][1]).toEqual({});
  });
});
