import { supabase } from "@/integrations/supabase/client";
import type { PulseCampaignGoal } from "@/lib/pulseCampaignGoals";
import type { PulseTargetKind } from "../../supabase/functions/_shared/pulse/targets/kinds.ts";
import { buildPulseTargetPatch } from "../../supabase/functions/_shared/pulse/targets/patch.ts";

/** An approved target saved from the dashboard (a value, or null to remove it). */
export type PulseTargetSaveInput = {
  /**
   * A campaign target: the one table that holds it. A platform target: every
   * report table of the client × platform.
   */
  tableIds: string[];
  goal: PulseCampaignGoal;
  kind: PulseTargetKind;
  value: number | null;
  campaignId?: string | null;
  campaignName?: string | null;
};

/** Identifies the row being saved (the editor shows a spinner on it). */
export function pulseTargetSaveKey(
  input: Pick<PulseTargetSaveInput, "tableIds" | "campaignId" | "campaignName">,
): string {
  const slot = input.campaignId || input.campaignName || null;
  return slot
    ? `${input.tableIds[0] ?? ""}:${slot}`
    : `platform:${[...input.tableIds].sort().join(",")}`;
}

/**
 * Writes an approved target to every given table of the tenant. Each table's
 * stored settings are read right before the write (syncs write
 * integration_settings too, so the cached copy may be stale), patched and written
 * back. A sync landing between that read and the write can still lose one side's
 * change; an atomic jsonb_set RPC would need a migration, and saves are rare. A
 * platform target goes to every table of the client × platform, as Carmen's
 * set_pulse_target does, so the pulse finds the same target whichever table it
 * reads the campaigns from. A table the user may read but not update stops the
 * save with a permission error; the tables before it keep the new target.
 */
export async function savePulseTargetToTables(
  input: PulseTargetSaveInput,
  tenantId: string,
  setBy: string | null,
): Promise<void> {
  if (!input.tableIds.length) {
    throw new Error("אין טבלת קמפיינים לשמירת היעד");
  }
  for (const tableId of input.tableIds) {
    const { data: current, error: readError } = await supabase
      .from("crm_tables")
      .select("integration_settings")
      .eq("id", tableId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (readError) {
      throw readError;
    }
    if (!current) {
      throw new Error("הטבלה לא נמצאה");
    }
    const next = buildPulseTargetPatch(current.integration_settings ?? {}, {
      goal: input.goal,
      kind: input.kind,
      value: input.value,
      source: "approved",
      campaignId: input.campaignId ?? null,
      campaignName: input.campaignName ?? null,
      setBy,
    });
    // RLS lets some users read a table they may not update (a report table
    // shared between orgs, a read-only role): the update then matches no row and
    // returns no error, so the saved row is selected back to tell.
    const { data: updated, error } = await supabase
      .from("crm_tables")
      .update({ integration_settings: next })
      .eq("id", tableId)
      .eq("tenant_id", tenantId)
      .select("id");
    if (error) {
      throw error;
    }
    if (!updated?.length) {
      throw new Error("אין לך הרשאה לעדכן את היעד בטבלה הזו");
    }
  }
}
