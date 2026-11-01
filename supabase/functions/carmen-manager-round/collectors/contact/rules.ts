/**
 * Thresholds of the contact collector, from the tenant's pulse_alert_rules:
 * manager.contact.log_grace_hours and min_call_seconds, and the pulse's own
 * no_contact_enabled and no_contact_days, so the legacy pulse alert and the
 * round share one setting. Until the P4 cutover both send in team mode;
 * retiring the legacy alert, one contact model for the dashboards and the
 * no-call flag follow in AIO-274.
 */
import { positive, record } from "../../../_shared/manager-round/settings.ts";
import { CLIENT_CALL_STALE_DAYS } from "../../../_shared/pulse/client-call.ts";
import { parsePulseAlertRules } from "../../../_shared/pulse-instant-alerts.ts";

export type ContactRules = {
  /** Hours after a call or meeting before an unlogged one is a finding. */
  logGraceHours: number;
  /** Shorter calls (and unanswered ones) are not contact. */
  minCallSeconds: number;
  /** Off (pulse_alert_rules.no_contact_enabled = false): no no_contact findings. */
  noContactEnabled: boolean;
  /** Days without contact or a log before a client is no_contact. */
  noContactDays: number;
};

export const CONTACT_DEFAULTS = { logGraceHours: 24, minCallSeconds: 60 };

const DAY_MS = 86_400_000;

/** Contact rules from stored pulse_alert_rules (any shape), with defaults. */
export function contactRules(pulseAlertRules: unknown): ContactRules {
  const contact = record(record(record(pulseAlertRules).manager).contact);
  const pulse = parsePulseAlertRules(pulseAlertRules);
  return {
    logGraceHours: positive(
      contact.log_grace_hours,
      CONTACT_DEFAULTS.logGraceHours,
    ),
    minCallSeconds: positive(
      contact.min_call_seconds,
      CONTACT_DEFAULTS.minCallSeconds,
    ),
    noContactEnabled: pulse.no_contact_enabled !== false,
    noContactDays: pulse.no_contact_days ?? CLIENT_CALL_STALE_DAYS,
  };
}

/** no_contact_days in milliseconds: how long a silence lasts before it is a finding. */
export function noContactWindowMs(rules: ContactRules): number {
  return rules.noContactDays * DAY_MS;
}
