import { describe, expect, test } from "vitest";

import {
  asSettingsAutomationKey,
  mapSettingsAutomations,
  settingsAutomationPatch,
} from "./carmenSettingsAutomations";
import { selectRows } from "./carmenTaskRows";

const stored = {
  enabled: true,
  campaign_pulse_enabled: false,
  pulse_alert_rules: {
    instant_wa_enabled: false,
    no_contact_days: 21,
    manager: { mode: "david_only", cost: { max: 5 } },
  },
};

describe("mapSettingsAutomations", () => {
  test("an org with no settings row shows the stored defaults", () => {
    const rows = mapSettingsAutomations(null, null);
    const enabled = Object.fromEntries(rows.map((r) => [r.id, r.enabled]));
    expect(enabled).toEqual({
      heartbeat: false,
      weekly_pulse: false,
      instant_pulse_alerts: true,
      manager_round: true,
    });
    expect(selectRows(rows, "automation")).toHaveLength(4);
  });

  test("each card reads its own stored field", () => {
    const rows = mapSettingsAutomations(stored, "2026-11-03T12:00:00Z");
    const enabled = Object.fromEntries(rows.map((r) => [r.id, r.enabled]));
    expect(enabled).toEqual({
      heartbeat: true,
      weekly_pulse: false,
      instant_pulse_alerts: false,
      manager_round: true,
    });
    expect(rows.find((r) => r.id === "weekly_pulse")?.status).toBe("paused");
  });
});

describe("settingsAutomationPatch", () => {
  test("instant alerts keep every other stored rule", () => {
    expect(
      settingsAutomationPatch(stored, "instant_pulse_alerts", true),
    ).toEqual({
      pulse_alert_rules: {
        ...stored.pulse_alert_rules,
        instant_wa_enabled: true,
      },
    });
  });

  test("the manager round switches between off and observe, keeping the block", () => {
    expect(settingsAutomationPatch(stored, "manager_round", false)).toEqual({
      pulse_alert_rules: {
        ...stored.pulse_alert_rules,
        manager: { mode: "off", cost: { max: 5 } },
      },
    });
    expect(settingsAutomationPatch(null, "manager_round", true)).toEqual({
      pulse_alert_rules: { manager: { mode: "observe" } },
    });
  });

  test("heartbeat and weekly pulse write only their column", () => {
    expect(settingsAutomationPatch(stored, "heartbeat", false)).toEqual({
      enabled: false,
    });
    expect(settingsAutomationPatch(stored, "weekly_pulse", true)).toEqual({
      campaign_pulse_enabled: true,
    });
  });

  test("a route segment that names none of them is refused", () => {
    expect(asSettingsAutomationKey("manager_round")).toBe("manager_round");
    expect(asSettingsAutomationKey("meta_status_check")).toBeNull();
  });
});
