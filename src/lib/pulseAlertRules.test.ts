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
      unanswered_reply_hours: 3,
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
      unanswered_reply_hours: 3,
    });
    expect(
      mergePulseAlertRules(null, { manager: { cost: { trend_pct: 45 } } })
        .manager,
    ).toEqual({ cost: { trend_pct: 45 } });
  });

  it("saves the reply hours at the top level, so a non-owner's save sends no manager block", () => {
    const stored = { manager: { mode: "observe" } };
    const merged = mergePulseAlertRules(
      stored,
      parsePulseAlertRules({ ...stored, unanswered_reply_hours: 6 }),
    );
    expect(merged.unanswered_reply_hours).toBe(6);
    expect("manager" in merged).toBe(false);
  });

  it("sends no manager block when nothing in it changes", () => {
    const stored = { manager: { mode: "observe" } };
    // Without a manager key the settings guard keeps the stored block.
    expect(
      "manager" in mergePulseAlertRules(stored, parsePulseAlertRules(stored)),
    ).toBe(false);
  });
});

describe("parsePulseAlertRules", () => {
  it("reads the reply hours as a number of at least 1, 3 by default", () => {
    const hours = (raw: unknown) =>
      parsePulseAlertRules({ unanswered_reply_hours: raw })
        .unanswered_reply_hours;
    expect([hours(5), hours("2"), hours(0.5)]).toEqual([5, 2, 1]);
    expect([hours(undefined), hours("x"), hours(0), hours(-4)]).toEqual([
      3, 3, 3, 3,
    ]);
    expect(parsePulseAlertRules(null).unanswered_reply_hours).toBe(3);
    expect(DEFAULT_PULSE_ALERT_RULES.unanswered_reply_hours).toBe(3);
  });

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

  it("leaves the switch to the database on a save without a manager change", () => {
    const stored = { manager: { card_log_system_sends: true } };
    for (const patch of [
      {},
      { card_log_system_sends: undefined },
      { card_log_system_sends: true },
    ]) {
      expect(
        "manager" in
          mergePulseAlertRules(stored, DEFAULT_PULSE_ALERT_RULES, patch),
      ).toBe(false);
    }
  });
});

describe("mergePulseAlertRules and the manager block", () => {
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
