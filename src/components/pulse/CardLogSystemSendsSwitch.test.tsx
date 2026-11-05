import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CardLogSystemSendsSwitch } from "./CardLogSystemSendsSwitch";

const SWITCH_LABEL = "תיעוד אוטומטי בכרטיס הלקוח של הודעות שנשלחו מהמערכת";

describe("CardLogSystemSendsSwitch", () => {
  it("shows the stored value and reports a flip", async () => {
    const onCheckedChange = vi.fn();
    render(
      <CardLogSystemSendsSwitch
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    const toggle = screen.getByRole("switch", { name: SWITCH_LABEL });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.setup().click(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("says the entries never count as contact with the client", () => {
    render(<CardLogSystemSendsSwitch checked onCheckedChange={() => {}} />);
    expect(screen.getByRole("switch", { name: SWITCH_LABEL })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByText(/רישומים אלה לא נחשבים כשיחה עם הלקוח/),
    ).toBeInTheDocument();
  });
});
