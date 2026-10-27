import { describe, expect, it } from "vitest";

import {
  DEFAULT_PULSE_ALERT_RULES,
  mergePulseAlertRules,
  parsePulseAlertRules,
} from "./pulseAlertRules";

describe("mergePulseAlertRules", () => {
  it("keeps every key the dialog does not edit, including other manager settings", () => {
    const stored = {
      ...DEFAULT_PULSE_ALERT_RULES,
      future_rule: { threshold: 3 },
      manager: {
        mode: "observe",
        cost: { trend_pct: 50 },
        card_log_system_sends: true,
        notify_since: "2026-10-20T06:00:00Z",
      },
    };
    const merged = mergePulseAlertRules(stored, {
      ...parsePulseAlertRules(stored),
      cpl_spike_pct: 80,
    });
    expect(merged.cpl_spike_pct).toBe(80);
    expect(merged.future_rule).toEqual({ threshold: 3 });
    expect(merged.manager).toEqual(stored.manager);
  });

  it("changes only the mode when an owner picks one", () => {
    const stored = { manager: { mode: "observe", cost: { trend_pct: 50 } } };
    const merged = mergePulseAlertRules(stored, DEFAULT_PULSE_ALERT_RULES, {
      mode: "david_only",
    });
    expect(merged.manager).toEqual({
      mode: "david_only",
      cost: { trend_pct: 50 },
    });
  });

  it("adds no manager block on a plain first save and leaves the mode on an empty patch", () => {
    expect(
      "manager" in mergePulseAlertRules(null, DEFAULT_PULSE_ALERT_RULES),
    ).toBe(false);
    const stored = { manager: { mode: "team" } };
    expect(
      mergePulseAlertRules(stored, DEFAULT_PULSE_ALERT_RULES, {
        mode: undefined,
      }).manager,
    ).toEqual({ mode: "team" });
  });
});
