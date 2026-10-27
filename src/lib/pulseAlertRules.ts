import type { ManagerMode } from "../../supabase/functions/_shared/manager-round/modes.ts";

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
 * may keep more keys there (cost thresholds, logging switches, collector
 * settings); they are always preserved.
 */
export type PulseManagerSettings = {
  /** Carmen's rollout mode; owner-only (the database refuses others). */
  mode?: ManagerMode;
};

/**
 * Saves the edited alert rules and the manager settings; the caller merges
 * both into the stored pulse_alert_rules (mergePulseAlertRules).
 */
export type SavePulseAlertRules = (
  rules: PulseAlertRules,
  manager: PulseManagerSettings,
) => void;

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? { ...raw }
    : {};
}

/**
 * The pulse_alert_rules value to save: the stored JSON with the edited alert
 * rules laid over it; keys this screen does not know are kept. The manager
 * block is sent only when a manager setting actually changes: without it the
 * database keeps the stored block (carmen_manager_settings_guard), so a stale
 * page never reverts it and a non-owner's save never touches it.
 */
export function mergePulseAlertRules(
  stored: unknown,
  rules: PulseAlertRules,
  manager: PulseManagerSettings = {},
): Record<string, unknown> {
  const { manager: storedManager, ...current } = asRecord(stored);
  const merged: Record<string, unknown> = {
    ...current,
    ...parsePulseAlertRules({ ...current, ...rules }),
  };
  const block = asRecord(storedManager);
  const changes = Object.entries(manager).filter(
    ([key, value]) => value !== undefined && block[key] !== value,
  );
  if (changes.length > 0) {
    merged.manager = { ...block, ...Object.fromEntries(changes) };
  }
  return merged;
}
