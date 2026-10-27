/**
 * Thresholds of the contact collector, from the tenant's pulse_alert_rules:
 * manager.contact.log_grace_hours and min_call_seconds, and the pulse's own
 * no_contact_days, so the legacy pulse alert and the round share one setting.
 */
import { positive, record } from "../../../_shared/manager-round/settings.ts";
import { CLIENT_CALL_STALE_DAYS } from "../../../_shared/pulse-client-call.ts";
import { parsePulseAlertRules } from "../../../_shared/pulse-instant-alerts.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";

export type ContactRules = {
  /** Hours after a call or meeting before an unlogged one is a finding. */
  logGraceHours: number;
  /** Shorter calls (and unanswered ones) are not contact. */
  minCallSeconds: number;
  /** Days without contact or a log before a client is no_contact. */
  noContactDays: number;
};

export const CONTACT_DEFAULTS = { logGraceHours: 24, minCallSeconds: 60 };

/** The tenant's contact rules, from its newest heartbeat settings row. */
export async function loadContactRules(
  db: DbClient,
  tenantId: string,
): Promise<ContactRules> {
  const { data, error } = await db
    .from("tenant_heartbeat_settings")
    .select("pulse_alert_rules")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIf(error, "tenant_heartbeat_settings");
  return contactRules(data?.pulse_alert_rules ?? null);
}

/** Contact rules from stored pulse_alert_rules (any shape), with defaults. */
export function contactRules(pulseAlertRules: unknown): ContactRules {
  const contact = record(record(record(pulseAlertRules).manager).contact);
  return {
    logGraceHours: positive(
      contact.log_grace_hours,
      CONTACT_DEFAULTS.logGraceHours,
    ),
    minCallSeconds: positive(
      contact.min_call_seconds,
      CONTACT_DEFAULTS.minCallSeconds,
    ),
    noContactDays:
      parsePulseAlertRules(pulseAlertRules).no_contact_days ??
      CLIENT_CALL_STALE_DAYS,
  };
}
