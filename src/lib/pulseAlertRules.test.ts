import { describe, expect, it } from "vitest";
import {
  DEFAULT_PULSE_ALERT_RULES,
  mergePulseAlertRules,
  parsePulseAlertRules,
  readCardLogSystemSends,
} from "./pulseAlertRules";

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

describe("client card logging switch (pulse_alert_rules.manager)", () => {
  it("is off unless explicitly true", () => {
    for (const raw of [
      undefined,
      null,
      "x",
      {},
      { manager: [] },
      { manager: { card_log_system_sends: "true" } },
      { card_log_system_sends: true },
    ]) {
      expect(readCardLogSystemSends(raw)).toBe(false);
    }
    expect(
      readCardLogSystemSends({ manager: { card_log_system_sends: true } }),
    ).toBe(true);
  });
});

describe("mergePulseAlertRules with the card switch", () => {
  it("keeps every key the dialog does not edit", () => {
    const stored = {
      ...DEFAULT_PULSE_ALERT_RULES,
      future_rule: { threshold: 3 },
      manager: { mode: "observe", card_log_system_sends: true },
    };
    const merged = mergePulseAlertRules(stored, {
      ...parsePulseAlertRules(stored),
      cpl_spike_pct: 80,
    });
    expect(merged.cpl_spike_pct).toBe(80);
    expect(merged.future_rule).toEqual({ threshold: 3 });
    expect(merged.manager).toEqual({
      mode: "observe",
      card_log_system_sends: true,
    });
  });

  it("changes only its own manager key when the owner flips the switch", () => {
    const stored = {
      ...DEFAULT_PULSE_ALERT_RULES,
      manager: { mode: "david_only" },
    };
    const on = mergePulseAlertRules(stored, parsePulseAlertRules(stored), {
      card_log_system_sends: true,
    });
    expect(on.manager).toEqual({
      mode: "david_only",
      card_log_system_sends: true,
    });
    expect(readCardLogSystemSends(on)).toBe(true);

    const off = mergePulseAlertRules(on, parsePulseAlertRules(on), {
      card_log_system_sends: false,
    });
    expect(off.manager).toEqual({
      mode: "david_only",
      card_log_system_sends: false,
    });
  });

  it("writes defaults on a first save and adds manager only when set", () => {
    const plain = mergePulseAlertRules(null, DEFAULT_PULSE_ALERT_RULES);
    expect(plain).toEqual(parsePulseAlertRules(null));
    expect("manager" in plain).toBe(false);

    const withSwitch = mergePulseAlertRules(
      undefined,
      DEFAULT_PULSE_ALERT_RULES,
      { card_log_system_sends: true },
    );
    expect(withSwitch.manager).toEqual({ card_log_system_sends: true });
  });

  it("leaves the switch as it was on a save without a manager change", () => {
    const stored = { manager: { card_log_system_sends: true } };
    expect(
      readCardLogSystemSends(
        mergePulseAlertRules(stored, DEFAULT_PULSE_ALERT_RULES, {}),
      ),
    ).toBe(true);
    expect(
      readCardLogSystemSends(
        mergePulseAlertRules(stored, DEFAULT_PULSE_ALERT_RULES, {
          card_log_system_sends: undefined,
        }),
      ),
    ).toBe(true);
  });
});
