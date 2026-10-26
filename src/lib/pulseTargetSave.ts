// Saving an approved pulse target from the dashboard (AIO-236).
import type { PulseCampaignGoal } from "@/lib/pulseCampaignGoals";
import {
  buildPulseTargetPatch,
  type PulseTargetKind,
} from "@/lib/pulseTargets";

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

type StoredSettings = { integration_settings: unknown } | null;
type QueryResult<T> = PromiseLike<{ data: T; error: unknown }>;

/** The slice of the Supabase client this needs (crm_tables read and update). */
export type PulseTargetStore = {
  from: (table: "crm_tables") => {
    select: (columns: "integration_settings") => {
      eq: (
        column: "id",
        value: string,
      ) => { maybeSingle: () => QueryResult<StoredSettings> };
    };
    update: (patch: { integration_settings: Record<string, unknown> }) => {
      eq: (column: "id", value: string) => QueryResult<unknown>;
    };
  };
};

/**
 * Writes an approved target to every given table. Each table's stored settings are
 * read right before the write (syncs write integration_settings too, so the cached
 * copy may be stale), patched and written back. A platform target goes to every
 * table of the client × platform, as Carmen's set_pulse_target does, so the pulse
 * finds the same target whichever table it reads the campaigns from.
 */
export async function savePulseTargetToTables(
  store: PulseTargetStore,
  input: PulseTargetSaveInput,
  setBy: string | null,
): Promise<void> {
  if (!input.tableIds.length) throw new Error("אין טבלת קמפיינים לשמירת היעד");
  for (const tableId of input.tableIds) {
    const { data: current, error: readError } = await store
      .from("crm_tables")
      .select("integration_settings")
      .eq("id", tableId)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("הטבלה לא נמצאה");
    const next = buildPulseTargetPatch(
      (current.integration_settings ?? {}) as Record<string, unknown>,
      {
        goal: input.goal,
        kind: input.kind,
        value: input.value,
        source: "approved",
        campaignId: input.campaignId ?? null,
        campaignName: input.campaignName ?? null,
        setBy,
      },
    );
    const { error } = await store
      .from("crm_tables")
      .update({ integration_settings: next })
      .eq("id", tableId);
    if (error) throw error;
  }
}
