// Recording updates after a summary is saved (AIO-581).
import type { serviceClient } from "../_shared/supabase-clients.ts";
import type { SummaryTargetType, WriteSummaryInput } from "./write-summary.ts";

type Admin = ReturnType<typeof serviceClient>;

/** The recording's assignment for the summary target. */
export function assignmentFor(
  targetType: SummaryTargetType,
  targetId: string,
  targetAgencyId: string | null,
) {
  switch (targetType) {
    case "client":
      return {
        client_id: targetId,
        lead_id: null,
        agency_id: null,
        campaigner_ids: [],
        summary_scope: "client",
      };
    case "lead":
      return {
        client_id: null,
        lead_id: targetId,
        agency_id: null,
        campaigner_ids: [],
        summary_scope: "lead",
      };
    case "campaigner":
      return {
        client_id: null,
        lead_id: null,
        agency_id: targetAgencyId,
        campaigner_ids: [targetId],
        summary_scope: "campaigner",
      };
    default:
      return {
        client_id: null,
        lead_id: null,
        agency_id: targetId,
        campaigner_ids: [],
        summary_scope: "agency",
      };
  }
}

/** Assigns the summarized recording to the target. */
export async function assignRecording(
  admin: Admin,
  input: WriteSummaryInput,
): Promise<void> {
  const { error } = await admin
    .from("zoom_recordings")
    .update(
      assignmentFor(input.targetType, input.targetId, input.targetAgencyId),
    )
    .eq("tenant_id", input.tenantId)
    .eq("id", input.recordingId ?? "");
  if (error) {
    console.error(
      "[summarize-recording] assignment failed",
      input.recordingId,
      error.message,
    );
  }
}

/**
 * Copies the summary to every recording of the same meeting, so every card
 * shows it. Throws when the copy fails, so the background writer logs it.
 */
export async function copyToMeetingRecordings(
  admin: Admin,
  input: WriteSummaryInput,
  summary: string,
  fileUrl: string,
): Promise<void> {
  const { data: rec, error } = await admin
    .from("zoom_recordings")
    .select("meeting_id")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.recordingId ?? "")
    .maybeSingle();
  if (error || !rec?.meeting_id) {
    if (error) {
      console.error("[summarize-recording] meeting lookup failed", error);
    }
    return;
  }
  const { error: copyError } = await admin
    .from("zoom_recordings")
    .update({
      summary_md: summary,
      summary_file_url: fileUrl,
      summary_generated_at: new Date().toISOString(),
    })
    .eq("tenant_id", input.tenantId)
    .eq("meeting_id", rec.meeting_id);
  if (copyError) {
    throw new Error(
      `copying the summary to the meeting's recordings failed: ${copyError.message}`,
    );
  }
}
