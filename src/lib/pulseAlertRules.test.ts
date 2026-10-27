import { describe, expect, it } from "vitest";
import { mergePulseAlertRules, parsePulseAlertRules } from "./pulseAlertRules";

describe("mergePulseAlertRules", () => {
  it("puts the dialog's values over the stored rules and keeps unknown keys", () => {
    const stored = {
      instant_wa_enabled: true,
      future_flag: "kept",
      manager: {
        mode: "observe",
        cost: { trend_pct: 40, watch_pct: 20, min_spend_7d: 300 },
      },
    };
    const edited = parsePulseAlertRules({
      ...stored,
      instant_wa_enabled: false,
      manager: { cost: { trend_pct: 55, target_less_alerts: true } },
    });
    expect(mergePulseAlertRules(stored, edited)).toEqual({
      instant_wa_enabled: false,
      no_contact_enabled: true,
      no_contact_days: 14,
      cpl_spike_enabled: true,
      cpl_spike_pct: 50,
      disconnected_enabled: true,
      future_flag: "kept",
      manager: {
        mode: "observe",
        cost: {
          trend_pct: 55,
          watch_pct: 20,
          min_spend_7d: 300,
          target_less_alerts: true,
        },
      },
    });
  });

  it("starts from the defaults when nothing usable is stored", () => {
    expect(mergePulseAlertRules(null, {})).toEqual({
      instant_wa_enabled: true,
      no_contact_enabled: true,
      no_contact_days: 14,
      cpl_spike_enabled: true,
      cpl_spike_pct: 50,
      disconnected_enabled: true,
      manager: { cost: {} },
    });
  });
});

describe("parsePulseAlertRules", () => {
  it("keeps a manager block and drops one whose cost is not an object", () => {
    expect(
      parsePulseAlertRules({ manager: { cost: { trend_pct: 60 } } }).manager,
    ).toEqual({ cost: { trend_pct: 60 } });
    expect(parsePulseAlertRules({ manager: { cost: 5 } }).manager).toBe(
      undefined,
    );
  });
});
