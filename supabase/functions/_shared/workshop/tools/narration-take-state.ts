/**
 * The project's narration take as workshop_narration_take reports it (narration-review.ts reads it
 * before every production call in semi-automatic mode).
 */

import type { Db } from "../db.ts";
import { asRecord } from "../record.ts";

/** workshop_narration_take's answer (migration 20261105170000_workshop_narration_review). */
export interface NarrationTake {
  ready: boolean;
  talking: boolean;
  run_id: string | null;
  pronunciations_changed: boolean;
  in_flight: boolean;
  last_run_id: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  /** A tenant pronunciation was saved or changed after the newest voice run was queued. */
  pronunciations_since_last_run: boolean;
}

/**
 * The project's take, null for a project the RPC does not know, or an error when it cannot be read
 * (logged): the review then stops production instead of letting an unheard narration through.
 */
export async function loadTake(
  supabase: Db,
  itemId: string,
): Promise<{ take: NarrationTake | null } | { error: string }> {
  const { data, error } = await supabase.rpc("workshop_narration_take", {
    p_item_id: itemId,
  });
  if (error) {
    console.error("[workshop] narration take not read", itemId, error.message);
    return { error: `בדיקת הקריינות לא נקראה: ${error.message}` };
  }
  if (!data || typeof data !== "object") {
    return { take: null };
  }
  const take = asRecord(data);
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  const status = text(take.last_run_status);
  return {
    take: {
      ready: take.ready === true,
      talking: take.talking === true,
      run_id: text(take.run_id),
      pronunciations_changed: take.pronunciations_changed === true,
      in_flight: status === "queued" || status === "running",
      last_run_id: text(take.last_run_id),
      last_run_status: status,
      last_run_error: text(take.last_run_error),
      pronunciations_since_last_run:
        take.pronunciations_since_last_run === true,
    },
  };
}
