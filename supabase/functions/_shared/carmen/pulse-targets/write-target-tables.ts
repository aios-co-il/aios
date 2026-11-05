import {
  buildPulseTargetPatch,
  type PulseTargetPatchInput,
} from "../../pulse/targets/patch.ts";
import { revertPulseTargetPatch } from "../../pulse/targets/revert.ts";
import type { PulseTargetDb } from "./context.ts";
import { writeTableSettings } from "./write-table-settings.ts";

/** A report table a target is written to, with its settings as read before the write. */
export type TargetTable = { id: string; integration_settings: unknown };

/**
 * What writing one target to several tables did. On a failure, `stillWritten`
 * names the tables that keep the new target because their restore failed too.
 */
export type TargetTablesWrite =
  { ok: true } | { ok: false; error: string; stillWritten: string[] };

/**
 * Writes one target to each table, all or none. A table that fails or takes no
 * write stops the loop, and each table already written gets its previous target
 * back: integration_settings is JSON on separate rows, so a compensating write
 * stands in for a transaction. Each write is a read-modify-write of the settings
 * read before the loop, so a sync writing the same JSON in between can lose one
 * side's change; an atomic jsonb_set RPC (a migration) replaces it in AIO-271.
 */
export async function writeTargetToTables(
  db: PulseTargetDb,
  {
    tables,
    tenantIds,
    patch,
  }: {
    tables: TargetTable[];
    tenantIds: string[];
    patch: PulseTargetPatchInput;
  },
): Promise<TargetTablesWrite> {
  const written: TargetTable[] = [];
  for (const table of tables) {
    const error = await writeTableSettings(db, {
      tableId: table.id,
      tenantIds,
      settings: buildPulseTargetPatch(table.integration_settings || {}, patch),
    });
    if (error) {
      const stillWritten = await restoreTables(db, written, tenantIds, patch);
      return { ok: false, error, stillWritten };
    }
    written.push(table);
  }
  return { ok: true };
}

/** Restores each written table; returns the ids whose restore failed (logged). */
async function restoreTables(
  db: PulseTargetDb,
  tables: TargetTable[],
  tenantIds: string[],
  patch: PulseTargetPatchInput,
): Promise<string[]> {
  const failed: string[] = [];
  for (const table of tables) {
    const error = await restoreTable(db, table, tenantIds, patch);
    if (error) {
      console.error("pulse target: restoring a table failed", {
        table_id: table.id,
        error,
      });
      failed.push(table.id);
    }
  }
  return failed;
}

/**
 * Puts the table's previous target back over its settings read now, so a sync
 * that wrote the table since keeps its change. A table deleted since holds no
 * target to restore. Returns why the restore failed, or null.
 */
async function restoreTable(
  db: PulseTargetDb,
  table: TargetTable,
  tenantIds: string[],
  patch: PulseTargetPatchInput,
): Promise<string | null> {
  const { data: current, error } = await db
    .from("crm_tables")
    .select("integration_settings")
    .eq("id", table.id)
    .in("tenant_id", tenantIds)
    .maybeSingle();
  if (error) {
    return error.message;
  }
  if (!current) {
    return null;
  }
  return await writeTableSettings(db, {
    tableId: table.id,
    tenantIds,
    settings: revertPulseTargetPatch(
      current.integration_settings,
      table.integration_settings,
      patch,
    ),
  });
}
