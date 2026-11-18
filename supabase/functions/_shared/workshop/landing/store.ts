import type { Db } from "../db.ts";
import { savePayload } from "../project-io.ts";
import { asRecord } from "../record.ts";
import { type LandingState, landingStateOf, withLanding } from "./project.ts";

/**
 * Changes a project's landing state from what the database holds now, not from a copy a tool
 * loaded earlier, so a save never restores an older copy or approval over a newer one. `change`
 * gets the current state and returns the part to replace, or null to leave the project as it is.
 * Returns the state before and after; throws when the project cannot be read or written.
 */
export async function updateLanding(
  supabase: Db,
  tenantId: string,
  itemId: string,
  change: (current: LandingState) => LandingState | null,
): Promise<{ before: LandingState; after: LandingState; changed: boolean }> {
  const { data, error } = await supabase
    .from("marketing_work_items")
    .select("payload")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("פרויקט לא נמצא");
  }
  const payload = asRecord(data.payload);
  const before = landingStateOf(payload);
  const patch = change(before);
  if (!patch) {
    return { before, after: before, changed: false };
  }
  const next = withLanding(payload, patch);
  await savePayload(supabase, tenantId, itemId, next);
  return { before, after: landingStateOf(next), changed: true };
}
