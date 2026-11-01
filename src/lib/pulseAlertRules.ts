import type { ManagerMode } from "../../supabase/functions/_shared/manager-round/modes.ts";
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
 * pulse_alert_rules.manager. Every member edits cost (read by
 * resolvePulseCostRules); the rest is owner-only (carmen_manager_settings_guard).
 * Other code may keep more keys there (collector settings, caps, hours); they
 * are always preserved.
 */
export type PulseManagerSettings = {
  cost?: Partial<PulseCostRules>;
  /** Carmen's rollout mode for the manager round. */
  mode?: ManagerMode;
  /**
   * Log what AIOS sends to a client (reports, dashboard shares, meeting
   * summaries, broadcasts, Carmen and automation messages, chat replies) on
   * the client card automatically. Off unless an owner turns it on.
   */
  card_log_system_sends?: boolean;
  [key: string]: unknown;
};

/** Whether the tenant logs system sends on the client card (default false). */
export function readCardLogSystemSends(raw: unknown): boolean {
  const manager = isJsonObject(raw) ? raw.manager : undefined;
  return isJsonObject(manager) && manager.card_log_system_sends === true;
}

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
/**
 * Saves the edited alert rules and the owner-only manager settings the dialog
 * sets outside them; the caller merges both into the stored pulse_alert_rules
 * (mergePulseAlertRules).
 */
export type SavePulseAlertRules = (
  rules: PulseAlertRules,
  manager: PulseManagerSettings,
) => void;

/**
 * The pulse_alert_rules value to save: the stored JSON with the dialog's rules
 * on top; keys the dialog does not know are kept. The manager block is sent
 * only when something in it changes (cost, key by key, or a managerPatch key):
 * without it the database keeps the stored block
 * (carmen_manager_settings_guard), so a stale page never reverts it and a
 * save that changes nothing there never touches it. An undefined managerPatch
 * value leaves the stored one.
 */
export function mergePulseAlertRules(
  stored: unknown,
  edited: PulseAlertRules,
  managerPatch: PulseManagerSettings = {},
): Record<string, unknown> {
  const { manager: storedManager, ...base } = isJsonObject(stored)
    ? stored
    : {};
  const { manager: editedManager, ...rules } = parsePulseAlertRules(edited);
  const merged: Record<string, unknown> = { ...base, ...rules };
  const block = isJsonObject(storedManager) ? storedManager : {};
  const changes: Record<string, unknown> = Object.fromEntries(
    Object.entries(managerPatch).filter(
      ([key, value]) => value !== undefined && block[key] !== value,
    ),
  );
  const storedCost = isJsonObject(block.cost) ? block.cost : {};
  const cost = { ...storedCost, ...editedManager?.cost };
  if (JSON.stringify(cost) !== JSON.stringify(storedCost)) {
    changes.cost = cost;
  }
  if (Object.keys(changes).length > 0) {
    merged.manager = { ...block, ...changes };
  }
  return merged;
}

/** A stored manager block: an object whose cost, when present, is an object too. */
function isManagerSettings(value: unknown): value is PulseManagerSettings {
  return (
    isJsonObject(value) &&
    (value.cost === undefined || isJsonObject(value.cost))
  );
}
