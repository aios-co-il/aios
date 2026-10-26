import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PulseAlertRulesDialog } from "./PulseAlertRulesDialog";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

describe("PulseAlertRulesDialog thresholds without a target", () => {
  it("lets a field be cleared while typing and never stores 0 for it", async () => {
    const onSave = vi.fn();
    render(
      <PulseAlertRulesDialog
        open
        onOpenChange={() => {}}
        value={{ manager: { cost: { trend_pct: 50, min_spend_7d: 400 } } }}
        onSave={onSave}
      />,
    );
    const trend = screen.getByLabelText(
      "עליית CPL/CPA (%)",
    ) as HTMLInputElement;
    fireEvent.change(trend, { target: { value: "" } });
    expect(trend.value).toBe(""); // no snap back to 40 while typing
    fireEvent.change(trend, { target: { value: "35" } });
    expect(trend.value).toBe("35");

    const minSpend = screen.getByLabelText(
      "הוצאה מינ׳ ב־7 ימים",
    ) as HTMLInputElement;
    fireEvent.change(minSpend, { target: { value: "" } });
    fireEvent.blur(minSpend);
    expect(minSpend.value).toBe("400"); // leaving it empty restores the value

    fireEvent.click(screen.getByRole("button", { name: "שמור חוקים" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].manager.cost).toMatchObject({
      trend_pct: 35,
      min_spend_7d: 400,
    });
  });
});
