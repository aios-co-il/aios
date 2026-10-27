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
    ]) {
      expect(readCardLogSystemSends(raw)).toBe(false);
    }
    expect(
      readCardLogSystemSends({ manager: { card_log_system_sends: true } }),
    ).toBe(true);
  });
});

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

  it("sends no manager block on a first save, an empty patch or an unchanged setting", () => {
    const plain = mergePulseAlertRules(null, DEFAULT_PULSE_ALERT_RULES);
    expect(plain).toEqual(parsePulseAlertRules(null));
    const stored = {
      manager: {
        mode: "team",
        max_alerts_per_recipient_per_day: 3,
        card_log_system_sends: true,
      },
    };
    for (const patch of [
      {},
      { mode: undefined, card_log_system_sends: undefined },
      { mode: "team" as const },
      { card_log_system_sends: true },
    ]) {
      expect(
        "manager" in
          mergePulseAlertRules(stored, DEFAULT_PULSE_ALERT_RULES, patch),
      ).toBe(false);
    }
  });

  it("adds the switch on a first save that turns it on", () => {
    const withSwitch = mergePulseAlertRules(
      undefined,
      DEFAULT_PULSE_ALERT_RULES,
      { card_log_system_sends: true },
    );
    expect(withSwitch.manager).toEqual({ card_log_system_sends: true });
  });
});
