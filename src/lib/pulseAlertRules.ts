import type { PulseCostRules } from "../../supabase/functions/_shared/pulse/cost-rules.ts";
import { isJsonObject } from "../../supabase/functions/_shared/pulse/json.ts";

export type PulseAlertRules = {
  /**
   * Per-run limits the dialog does not edit, kept as stored; the edge parser
   * (supabase/functions/_shared/pulse/exception-flood-guard.ts) reads them.
   */
  instant?: unknown;
  instant_wa_enabled?: boolean;
  no_contact_enabled?: boolean;
  no_contact_days?: number;
  cpl_spike_enabled?: boolean;
  cpl_spike_pct?: number;
  disconnected_enabled?: boolean;
  manager?: PulseManagerSettings;
};

/**
 * pulse_alert_rules.manager: only cost is edited from the dashboard (read by
 * resolvePulseCostRules); any other key is kept as stored.
 */
export type PulseManagerSettings = {
  cost?: Partial<PulseCostRules>;
  [key: string]: unknown;
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
    ...(input.instant === undefined ? {} : { instant: input.instant }),
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
    ...(isManagerSettings(input.manager) ? { manager: input.manager } : {}),
  };
}

/**
 * The stored pulse_alert_rules with the dialog's values on top. Keys the dialog
 * does not know (future settings, other manager keys) survive a save instead of
 * being wiped; manager.cost is merged key by key, and manager is written only
 * when it is stored or edited.
 */
export function mergePulseAlertRules(
  stored: unknown,
  edited: PulseAlertRules,
): Record<string, unknown> {
  const base = isJsonObject(stored) ? stored : {};
  const { manager: editedManager, ...rules } = parsePulseAlertRules(edited);
  const merged: Record<string, unknown> = { ...base, ...rules };
  const storedManager = isJsonObject(base.manager) ? base.manager : null;
  if (!storedManager && !editedManager) {
    return merged;
  }
  const manager: Record<string, unknown> = {
    ...storedManager,
    ...editedManager,
  };
  const storedCost = isJsonObject(storedManager?.cost)
    ? storedManager.cost
    : null;
  if (storedCost || editedManager?.cost) {
    manager.cost = { ...storedCost, ...editedManager?.cost };
  }
  merged.manager = manager;
  return merged;
}

/** A stored manager block: an object whose cost, when present, is an object too. */
function isManagerSettings(value: unknown): value is PulseManagerSettings {
  return (
    isJsonObject(value) &&
    (value.cost === undefined || isJsonObject(value.cost))
  );
}
