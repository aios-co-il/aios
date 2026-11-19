import type { Db } from "../db.ts";
import {
  type LandingState,
  landingTurnLines,
  withLanding,
  withLandingApprovals,
  landingStateOf,
} from "./project.ts";
import { updateLanding } from "./store.ts";

/** What Carmen is told when the user's approval could not be saved. */
const APPROVAL_NOT_SAVED =
  "המשתמש אישר, אבל האישור לא נשמר בגלל תקלה. אמרי לו שהאישור לא נקלט ובקשי שיאשר שוב; אל תתקדמי לשלב הבא.";

/**
 * A landing page project's part of the turn note: records the user's approval of the copy or the
 * style when this message gives it, then tells Carmen where the project stands. Recorded here,
 * before she acts, so an approval is kept even when her next call is something else. An approval
 * that cannot be saved leaves the step waiting and tells her so, never a silent loss.
 */
export async function landingTurn(
  supabase: Db,
  tenantId: string,
  itemId: string,
  payload: Record<string, unknown>,
  turn: { lastAssistant: string; userText: string },
): Promise<Array<string>> {
  if (!withLandingApprovals(payload, turn).changed) {
    return landingTurnLines(payload);
  }
  try {
    const saved = await updateLanding(supabase, tenantId, itemId, (current) =>
      approvalPatch(current, turn),
    );
    return landingTurnLines(withLanding(payload, saved.after));
  } catch (error) {
    console.error(
      `landing turn: approval for project ${itemId} not saved: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return [...landingTurnLines(payload), APPROVAL_NOT_SAVED];
  }
}

/** The approvals this message gives, judged against the state the database holds now. */
function approvalPatch(
  current: LandingState,
  turn: { lastAssistant: string; userText: string },
): LandingState | null {
  const approved = withLandingApprovals({ landing: current }, turn);
  if (!approved.changed) {
    return null;
  }
  const after = landingStateOf(approved.payload);
  return {
    copy_approved: after.copy_approved,
    style_approved: after.style_approved,
    ...(after.publish_approved
      ? { publish_approved: after.publish_approved }
      : {}),
  };
}
