import { describe, expect, it } from "vitest";

import { parsePulseAlertRules } from "./pulseAlertRules";

describe("parsePulseAlertRules", () => {
  it("keeps a stored instant cap, so saving the rules dialog does not reset it", () => {
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

  it("fills the default cap when none is stored", () => {
    expect(parsePulseAlertRules({}).instant).toEqual({
      max_exception_messages_per_run: 3,
    });
    expect(parsePulseAlertRules(null).instant).toEqual({
      max_exception_messages_per_run: 3,
    });
  });
});
