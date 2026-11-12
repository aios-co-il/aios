// Writes a recording's summary with the tenant's model and saves it (AIO-581).
// Runs after the HTTP response for a recording, because a long meeting takes
// longer to summarize than the gateway waits for a reply.
import {
  generateMeetingSummary,
  maybeCreateMarketingBrief,
  saveSummaryForTarget,
} from "../_shared/meeting-summary.ts";
import { tenantSummaryKey } from "../_shared/meeting-summary-openrouter.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import {
  assignRecording,
  copyToMeetingRecordings,
} from "./recording-updates.ts";

export type SummaryTargetType = "client" | "lead" | "campaigner" | "agency";

export interface WriteSummaryInput {
  openaiKey: string;
  tenantId: string;
  userId: string;
  recordingId: string | null;
  transcript: string;
  recordingInfo: string;
  focusPrompt: string;
  targetType: SummaryTargetType;
  targetId: string;
  targetName: string;
  targetAgencyId: string | null;
}

export interface WrittenSummary {
  summary: string;
  fileUrl: string;
  fileName: string;
  marketingBriefCreated: boolean;
  marketingWorkItemId: string | null;
}

/**
 * Generates the summary, saves the DOCX and the summary on every recording of
 * the meeting, assigns the recording to the target and creates a marketing
 * brief for a client meeting. Throws on a model or storage failure.
 */
export async function writeSummary(
  input: WriteSummaryInput,
): Promise<WrittenSummary> {
  const admin = serviceClient();
  const summary = await generateMeetingSummary(
    {
      openaiKey: input.openaiKey,
      openRouterKey: await tenantSummaryKey(admin, input.tenantId),
      tenantId: input.tenantId,
    },
    input.transcript,
    input.recordingInfo,
    input.focusPrompt,
  );
  const { fileUrl, fileName } = await saveSummaryForTarget(admin, {
    tenant_id: input.tenantId,
    target_type: input.targetType,
    target_id: input.targetId,
    target_name: input.targetName,
    summary,
    recording_id: input.recordingId,
    created_by: input.userId,
  });
  if (input.recordingId) {
    await assignRecording(admin, input);
    await copyToMeetingRecordings(admin, input, summary, fileUrl);
  }
  const brief =
    input.targetType === "client"
      ? await maybeCreateMarketingBrief(admin, input.openaiKey, {
          summary,
          tenant_id: input.tenantId,
          client_id: input.targetId,
          recording_id: input.recordingId,
          fileUrl,
          source: "zoom_meeting",
        })
      : { created: false, workItemId: null };
  return {
    summary,
    fileUrl,
    fileName,
    marketingBriefCreated: brief.created,
    marketingWorkItemId: brief.workItemId,
  };
}

/** Starts writeSummary after the response; a failure is logged with the recording id. */
export function writeSummaryInBackground(input: WriteSummaryInput): void {
  const work = writeSummary(input).then(
    () => console.log("[summarize-recording] summary saved", input.recordingId),
    (err) =>
      console.error(
        "[summarize-recording] background summary failed",
        input.recordingId,
        err instanceof Error ? err.message : err,
      ),
  );
  const runtime = (
    globalThis as {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
    }
  ).EdgeRuntime;
  runtime?.waitUntil?.(work);
}
