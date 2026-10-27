import { describe, expect, it } from "vitest";

import {
  DEFAULT_PULSE_ALERT_RULES,
  mergePulseAlertRules,
  parsePulseAlertRules,
} from "./pulseAlertRules";

describe("mergePulseAlertRules", () => {
  it("keeps every key the dialog does not edit and leaves the manager block to the database", () => {
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
    // Without a manager key the settings guard keeps the stored block.
    expect("manager" in merged).toBe(false);
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

  it("sends no manager block on a first save, an empty patch or an unchanged mode", () => {
    expect(
      "manager" in mergePulseAlertRules(null, DEFAULT_PULSE_ALERT_RULES),
    ).toBe(false);
    const stored = {
      manager: { mode: "team", max_alerts_per_recipient_per_day: 3 },
    };
    expect(
      "manager" in
        mergePulseAlertRules(stored, DEFAULT_PULSE_ALERT_RULES, {
          mode: undefined,
        }),
    ).toBe(false);
    expect(
      "manager" in
        mergePulseAlertRules(stored, DEFAULT_PULSE_ALERT_RULES, {
          mode: "team",
        }),
    ).toBe(false);
  });
});
