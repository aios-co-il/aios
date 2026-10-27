/**
 * unlinked_group: a group with client traffic that no client is linked to,
 * whose name matches exactly one client. The finding goes to the owner level
 * only (no client_id, so campaigners never see a group name from the
 * operator's phone); linking the group stays a human action.
 */
import type { FindingCandidate } from "../types.ts";
import type { UnlinkedGroupRow } from "./activity.ts";
import { clip } from "./clip.ts";

/** One owner-level suggestion per unlinked group. */
export function unlinkedGroupCandidates(
  rows: UnlinkedGroupRow[],
): FindingCandidate[] {
  return rows.map((row) => ({
    kind: "unlinked_group",
    fingerprint: `group:${row.group_chat_id}`,
    severity: "info",
    client_id: null,
    agency_id: null,
    source_event_at: row.last_message_at,
    summary_he: clip(
      `הקבוצה "${row.group_name}" לא משויכת ללקוח, אבל השם שלה מתאים ל-${row.client_name} (${row.message_count} הודעות לאחרונה). לשייך אותה ללקוח?`,
      500,
    ),
    evidence: {
      group_id: row.group_id,
      suggested_client_id: row.client_id,
      message_count: row.message_count,
      last_message_at: row.last_message_at,
    },
    owner_user_id: null,
  }));
}
