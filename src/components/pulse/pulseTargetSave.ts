import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { PulseCampaignGoal } from "@/lib/pulseCampaignGoals";
import type { PulseTargetKind } from "../../../supabase/functions/_shared/pulse/targets/kinds.ts";
import { buildPulseTargetPatch } from "../../../supabase/functions/_shared/pulse/targets/patch.ts";
import { revertPulseTargetPatch } from "../../../supabase/functions/_shared/pulse/targets/revert.ts";

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
 * Writes an approved target to every given table of the tenant, or to none. Each
 * table's stored settings are read right before the write (syncs write
 * integration_settings too, so the cached copy may be stale), patched and written
 * back. A sync landing between that read and the write can still lose one side's
 * change until an atomic jsonb_set RPC (a migration) replaces it in AIO-???. A
 * platform target goes to every table of the client × platform, as Carmen's
 * set_pulse_target does, so the pulse finds the same target whichever table it
 * reads the campaigns from. When a table fails, the tables already written get
 * their previous target back, and the error names any table that keeps the new
 * one because its restore failed too.
 */
export async function savePulseTargetToTables(
  input: PulseTargetSaveInput,
  tenantId: string,
  setBy: string | null,
): Promise<void> {
  if (!input.tableIds.length) {
    throw new Error("אין טבלת קמפיינים לשמירת היעד");
  }
  const written: SavedTable[] = [];
  for (const tableId of input.tableIds) {
    try {
      written.push(await saveToTable(tableId, input, tenantId, setBy));
    } catch (failure) {
      throw await restoreTables(written, input, tenantId, failure);
    }
  }
}

/** The error of a write RLS refused, or of a table deleted since it was read. */
export const TABLE_NOT_UPDATED =
  "היעד לא נשמר בטבלה: אין לך הרשאה לעדכן אותה, או שהיא נמחקה";

/** A table the save wrote: its name, and its settings before the write. */
type SavedTable = { id: string; name: string; before: Json | null };

/** Reads one table's stored settings, writes the target over them, and returns what it read. */
async function saveToTable(
  tableId: string,
  input: PulseTargetSaveInput,
  tenantId: string,
  setBy: string | null,
): Promise<SavedTable> {
  const { data: current, error } = await supabase
    .from("crm_tables")
    .select("name, integration_settings")
    .eq("id", tableId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    throw error;
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
  await writeSettings(tableId, tenantId, next);
  return {
    id: tableId,
    name: current.name,
    before: current.integration_settings,
  };
}

/**
 * Writes one table's integration_settings. RLS lets a read-only role read a
 * table it may not update: the update then matches no row and returns no error,
 * as it does for a table deleted since it was read, so the row is selected back
 * to tell.
 */
async function writeSettings(
  tableId: string,
  tenantId: string,
  settings: Json,
): Promise<void> {
  const { data, error } = await supabase
    .from("crm_tables")
    .update({ integration_settings: settings })
    .eq("id", tableId)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) {
    throw error;
  }
  if (!data?.length) {
    throw new Error(TABLE_NOT_UPDATED);
  }
}

/**
 * Puts the previous target back on each table written before the failure, and
 * returns the error to show: the original one, extended with the names of the
 * tables that keep the new target because their restore failed too.
 */
async function restoreTables(
  written: SavedTable[],
  input: PulseTargetSaveInput,
  tenantId: string,
  failure: unknown,
): Promise<unknown> {
  const kept: string[] = [];
  for (const table of written) {
    try {
      await restoreTable(table, input, tenantId);
    } catch (error) {
      console.error("pulse target: restoring a table failed", {
        table_id: table.id,
        error,
      });
      kept.push(table.name);
    }
  }
  if (!kept.length) {
    return failure;
  }
  const reason =
    failure instanceof Error ? failure.message : "שמירת היעד נכשלה";
  return new Error(`${reason}. היעד החדש נשאר בטבלאות: ${kept.join(", ")}`);
}

/**
 * Restores one table's previous target over its settings read now, so a sync
 * that wrote the table since keeps its change. A table deleted since holds no
 * target to restore.
 */
async function restoreTable(
  table: SavedTable,
  input: PulseTargetSaveInput,
  tenantId: string,
): Promise<void> {
  const { data: current, error } = await supabase
    .from("crm_tables")
    .select("integration_settings")
    .eq("id", table.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!current) {
    return;
  }
  const restored = revertPulseTargetPatch(
    current.integration_settings,
    table.before,
    input,
  );
  await writeSettings(table.id, tenantId, restored);
}
