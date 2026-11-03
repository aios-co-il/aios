/**
 * Reads and writes an org's automation switches (carmen_automation_settings,
 * AIO-314). RLS lets members read and owners write; a refused write surfaces
 * as the mutation's error.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  asAutomationKey,
  type AutomationSetting,
} from "@/lib/carmenAutomations";
import { asSettingsAutomationKey } from "@/lib/carmenSettingsAutomations";
import type { AutomationKey } from "../../../../supabase/functions/_shared/automations/keys.ts";
import { setHeartbeatAutomation } from "./heartbeatAutomationSwitch";

/** The org's stored switches; an automation with no row is on. */
export async function loadAutomationSettings(
  tenantId: string,
): Promise<Array<AutomationSetting>> {
  const { data, error } = await supabase
    .from("carmen_automation_settings")
    .select("automation_key, enabled, updated_at")
    .eq("tenant_id", tenantId);
  if (error) {
    throw error;
  }
  return data ?? [];
}

/** Switches one automation on or off for the org. */
export async function setAutomationEnabled(
  tenantId: string,
  key: AutomationKey,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("carmen_automation_settings")
    .upsert(
      { tenant_id: tenantId, automation_key: key, enabled },
      { onConflict: "tenant_id,automation_key" },
    );
  if (error) {
    throw error;
  }
}

/**
 * Switches any automation card: a carmen_automation_settings switch or one
 * kept in tenant_heartbeat_settings (AIO-316). An unknown id is refused.
 */
export async function toggleAutomation(
  tenantId: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  const key = asAutomationKey(id);
  if (key) {
    return setAutomationEnabled(tenantId, key, enabled);
  }
  const settingsKey = asSettingsAutomationKey(id);
  if (settingsKey) {
    return setHeartbeatAutomation(tenantId, settingsKey, enabled);
  }
  throw new Error("האוטומציה לא נמצאה");
}
