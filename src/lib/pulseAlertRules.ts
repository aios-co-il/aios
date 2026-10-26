export type PulseAlertRules = {
  instant_wa_enabled?: boolean;
  no_contact_enabled?: boolean;
  no_contact_days?: number;
  cpl_spike_enabled?: boolean;
  cpl_spike_pct?: number;
  disconnected_enabled?: boolean;
  /**
   * Manager settings (AIO-236 and later). Only manager.cost is edited here; any
   * other key is kept as stored. Read by _shared/pulse-cost-rules.mjs.
   */
  manager?: Record<string, unknown> & {
    cost?: {
      trend_pct?: number;
      roas_drop_pct?: number;
      min_spend_7d?: number;
      target_less_alerts?: boolean;
      [key: string]: unknown;
    };
  };
};

export const DEFAULT_PULSE_ALERT_RULES: PulseAlertRules = {
  instant_wa_enabled: true,
  no_contact_enabled: true,
  no_contact_days: 14,
  cpl_spike_enabled: true,
  cpl_spike_pct: 50,
  disconnected_enabled: true,
};

export function parsePulseAlertRules(raw: unknown): PulseAlertRules {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PULSE_ALERT_RULES };
  const input = raw as Record<string, unknown>;
  return {
    instant_wa_enabled: input.instant_wa_enabled !== false,
    no_contact_enabled: input.no_contact_enabled !== false,
    no_contact_days: Math.max(
      1,
      Number(input.no_contact_days) ||
        DEFAULT_PULSE_ALERT_RULES.no_contact_days!,
    ),
    cpl_spike_enabled: input.cpl_spike_enabled !== false,
    cpl_spike_pct: Math.max(
      1,
      Number(input.cpl_spike_pct) || DEFAULT_PULSE_ALERT_RULES.cpl_spike_pct!,
    ),
    disconnected_enabled: input.disconnected_enabled !== false,
    ...(input.manager && typeof input.manager === "object"
      ? { manager: input.manager as PulseAlertRules["manager"] }
      : {}),
  };
}

/**
 * The stored pulse_alert_rules with the dialog's values on top. Keys the dialog
 * does not know (future settings) survive a save instead of being wiped.
 */
export function mergePulseAlertRules(
  stored: unknown,
  edited: PulseAlertRules,
): Record<string, unknown> {
  const base =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const storedManager =
    base.manager && typeof base.manager === "object"
      ? (base.manager as Record<string, unknown>)
      : {};
  const parsed = parsePulseAlertRules(edited);
  const editedManager = parsed.manager ?? {};
  const storedCost =
    storedManager.cost && typeof storedManager.cost === "object"
      ? (storedManager.cost as Record<string, unknown>)
      : {};
  return {
    ...base,
    ...parsed,
    manager: {
      ...storedManager,
      ...editedManager,
      cost: { ...storedCost, ...(editedManager.cost ?? {}) },
    },
  };
}
