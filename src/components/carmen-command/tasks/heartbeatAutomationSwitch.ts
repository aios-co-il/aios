/**
 * Reads and writes the automation switches kept in tenant_heartbeat_settings
 * (AIO-316). Members may write the row; the database guard keeps the manager
 * block owner-only, so a member's manager round switch fails with its message.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import {
  settingsAutomationPatch,
  type HeartbeatAutomationFields,
  type SettingsAutomationKey,
} from "@/lib/carmenSettingsAutomations";

export type HeartbeatAutomationRow = {
  fields: HeartbeatAutomationFields;
  updatedAt: string | null;
};

/** The org's stored heartbeat fields; null fields when it has no row yet. */
export async function loadHeartbeatAutomations(
  tenantId: string,
): Promise<HeartbeatAutomationRow> {
  const { data, error } = await supabase
    .from("tenant_heartbeat_settings")
    .select("enabled, campaign_pulse_enabled, pulse_alert_rules, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return { fields: null, updatedAt: null };
  }
  const { updated_at, ...fields } = data;
  return { fields, updatedAt: updated_at };
}

/**
 * Switches one automation for the org. The row is read again just before the
 * write so the pulse_alert_rules merge starts from what is stored now, not
 * from the panel's last poll. Only the switched column is sent; a new row
 * takes the table defaults for the rest.
 */
export async function setHeartbeatAutomation(
  tenantId: string,
  key: SettingsAutomationKey,
  on: boolean,
): Promise<void> {
  const { fields } = await loadHeartbeatAutomations(tenantId);
  const row: TablesInsert<"tenant_heartbeat_settings"> = {
    tenant_id: tenantId,
    ...settingsAutomationPatch(fields, key, on),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("tenant_heartbeat_settings")
    .upsert(row, { onConflict: "tenant_id" });
  if (error) {
    throw error;
  }
}
