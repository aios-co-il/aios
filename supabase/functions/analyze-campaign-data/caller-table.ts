/**
 * The report table the caller asked about, read as the caller (RLS), so a
 * table they cannot open in the app answers 404 before any service-role read
 * (AIO-495). Shared-agency tables stay readable: RLS already grants them.
 */
import type { CampaignGoalTable } from "../_shared/campaign-goal/campaign-goals.ts";
import { isRecord } from "../_shared/ads-sync/is-record.ts";

/** The table row as the caller's read returns it. */
type CallerTableRow = {
  id: string;
  integration_type: string | null;
  integration_settings: unknown;
  category: string | null;
};

/** Reads one crm_tables row by id as the caller; injected so tests pass a fake. */
export type LoadCallerTable = (tableId: string) => PromiseLike<{
  data: CallerTableRow | null;
  error: { message?: string } | null;
}>;

/** The columns the caller's read selects. */
export const CALLER_TABLE_COLUMNS =
  "id, integration_type, integration_settings, category";

export type CallerTableResult =
  | { ok: true; table: CampaignGoalTable }
  | { ok: false; status: 404 | 500; error: string };

/**
 * The table by id, read as the caller (`loadTable`): 404 when RLS hides it or it
 * does not exist (one answer, so the id's existence is not revealed), 500 on
 * a read error.
 */
export async function readCallerTable(
  loadTable: LoadCallerTable,
  tableId: string,
): Promise<CallerTableResult> {
  const { data, error } = await loadTable(tableId);
  if (error) {
    console.error("[analyze-campaign-data] table read failed:", error.message);
    return { ok: false, status: 500, error: "Failed to fetch table" };
  }
  if (!data) {
    console.warn(
      "[analyze-campaign-data] table not visible to caller",
      tableId,
    );
    return { ok: false, status: 404, error: "Table not found" };
  }
  return {
    ok: true,
    table: {
      ...data,
      integration_settings: isRecord(data.integration_settings)
        ? data.integration_settings
        : null,
    },
  };
}
