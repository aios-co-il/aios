import { describe, expect, it } from "vitest";

import { parsePulseAlertRules } from "./pulseAlertRules";

describe("parsePulseAlertRules", () => {
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
