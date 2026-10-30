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

  it("starts from the defaults and adds manager only when it is set", () => {
    expect(mergePulseAlertRules(null, {})).toEqual({
      instant_wa_enabled: true,
      no_contact_enabled: true,
      no_contact_days: 14,
      cpl_spike_enabled: true,
      cpl_spike_pct: 50,
      disconnected_enabled: true,
    });
    expect(
      mergePulseAlertRules(null, { manager: { cost: { trend_pct: 45 } } })
        .manager,
    ).toEqual({ cost: { trend_pct: 45 } });
  });

  it("keeps a stored manager block without cost as it is", () => {
    const stored = { manager: { mode: "observe" } };
    expect(
      mergePulseAlertRules(stored, parsePulseAlertRules(stored)).manager,
    ).toEqual({ mode: "observe" });
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

  it("keeps the stored instant value, so saving the rules dialog does not reset it", () => {
    const stored = {
      instant_wa_enabled: true,
      cpl_spike_pct: 60,
      instant: { max_exception_messages_per_run: 1 },
    };
    // The dialog parses the stored value when it opens and again on save.
    const saved = parsePulseAlertRules(parsePulseAlertRules(stored));
    expect(saved.instant).toEqual({ max_exception_messages_per_run: 1 });
    expect(saved.cpl_spike_pct).toBe(60);
  });

  it("adds no instant value when none is stored", () => {
    expect("instant" in parsePulseAlertRules({})).toBe(false);
    expect("instant" in parsePulseAlertRules(null)).toBe(false);
  });
});
