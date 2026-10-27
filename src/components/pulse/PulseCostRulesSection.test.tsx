import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PulseAlertRules } from "@/lib/pulseAlertRules";
import { PulseCostRulesSection } from "./PulseCostRulesSection";

/** The section with its rules held in state, reporting each change. */
function Harness({
  initial,
  onRules,
}: {
  initial: PulseAlertRules;
  onRules: (rules: PulseAlertRules) => void;
}) {
  const [rules, setRules] = useState(initial);
  onRules(rules);
  return <PulseCostRulesSection rules={rules} onChange={setRules} />;
}

describe("PulseCostRulesSection", () => {
  it("shows the defaults and turns WhatsApp alerts on without losing other keys", () => {
    const onRules = vi.fn();
    render(
      <Harness
        initial={{ manager: { mode: "observe", cost: { trend_pct: 50 } } }}
        onRules={onRules}
      />,
    );
    expect(screen.getByLabelText("ירידת ROAS (%)")).toHaveDisplayValue("25");
    fireEvent.click(screen.getByRole("switch"));
    expect(onRules).toHaveBeenLastCalledWith({
      manager: {
        mode: "observe",
        cost: { trend_pct: 50, target_less_alerts: true },
      },
    });
  });
});
