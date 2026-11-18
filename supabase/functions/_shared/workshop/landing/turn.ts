import type { Db } from "../db.ts";
import { savePayload } from "../project-io.ts";
import { landingTurnLines, withLandingApprovals } from "./project.ts";

/**
 * A landing page project's part of the turn note: records the user's approval of the copy or the
 * style when this message gives it, then tells Carmen where the project stands. Recorded here,
 * before she acts, so an approval is kept even when her next call is something else.
 */
export async function landingTurn(
  supabase: Db,
  tenantId: string,
  itemId: string,
  payload: Record<string, unknown>,
  turn: { lastAssistant: string; userText: string },
): Promise<Array<string>> {
  const approved = withLandingApprovals(payload, turn);
  if (approved.changed) {
    await savePayload(supabase, tenantId, itemId, approved.payload);
  }
  return landingTurnLines(approved.payload);
}
