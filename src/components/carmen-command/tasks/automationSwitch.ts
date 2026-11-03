/**
 * Reads and writes an org's automation switches (carmen_automation_settings,
 * AIO-314). RLS lets members read and owners write; a refused write surfaces
 * as the mutation's error.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AutomationSetting } from "@/lib/carmenAutomations";
import type { AutomationKey } from "../../../../supabase/functions/_shared/automations/keys.ts";

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
