export type PulseAlertRules = {
  instant_wa_enabled?: boolean;
  no_contact_enabled?: boolean;
  no_contact_days?: number;
  cpl_spike_enabled?: boolean;
  cpl_spike_pct?: number;
  disconnected_enabled?: boolean;
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
  };
}

/**
 * Manager-round settings stored under pulse_alert_rules.manager. Other code
 * may keep more keys there; they are always preserved.
 */
export type PulseManagerSettings = {
  /**
   * Log what AIOS sends to a client (reports, dashboard shares, meeting
   * summaries, broadcasts, Carmen and automation messages, chat replies) on
   * the client card automatically. Off unless an owner turns it on.
   */
  card_log_system_sends?: boolean;
};

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/** Whether the tenant logs system sends on the client card (default false). */
export function readCardLogSystemSends(raw: unknown): boolean {
  return asRecord(asRecord(raw).manager).card_log_system_sends === true;
}

/**
 * The pulse_alert_rules value to save: the stored JSON with the edited alert
 * rules and manager settings laid over it. Keys this screen does not know
 * (other manager settings, future rules) are kept as they are.
 */
export function mergePulseAlertRules(
  stored: unknown,
  rules: PulseAlertRules,
  manager: PulseManagerSettings = {},
): Record<string, unknown> {
  const current = asRecord(stored);
  const merged: Record<string, unknown> = {
    ...current,
    ...parsePulseAlertRules({ ...current, ...rules }),
  };
  const managerPatch = Object.fromEntries(
    Object.entries(manager).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(managerPatch).length > 0 || "manager" in current) {
    merged.manager = { ...asRecord(current.manager), ...managerPatch };
  }
  return merged;
}
