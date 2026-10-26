import { describe, expect, it } from "vitest";

import {
  DEFAULT_PULSE_ALERT_RULES,
  mergePulseAlertRules,
  parsePulseAlertRules,
  readCardLogSystemSends,
} from "./pulseAlertRules";

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
    ])
      expect(readCardLogSystemSends(raw)).toBe(false);
    expect(
      readCardLogSystemSends({ manager: { card_log_system_sends: true } }),
    ).toBe(true);
  });
});

describe("mergePulseAlertRules", () => {
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
