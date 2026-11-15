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

type Admin = ReturnType<typeof serviceClient>;

export interface BackgroundDeps {
  write: (input: WriteSummaryInput) => Promise<WrittenSummary>;
  admin: () => Admin;
  waitUntil: (work: Promise<unknown>) => void;
}

/** EdgeRuntime.waitUntil when the runtime has it; otherwise the work just runs. */
function edgeWaitUntil(work: Promise<unknown>): void {
  const runtime = (
    globalThis as {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
    }
  ).EdgeRuntime;
  runtime?.waitUntil?.(work);
}

const defaultDeps: BackgroundDeps = {
  write: writeSummary,
  admin: serviceClient,
  waitUntil: edgeWaitUntil,
};

/**
 * Marks the recording's background summary as failed, so the waiting UI
 * stops and says so (AIO-593). Logs, and does not throw, when the mark fails.
 */
export async function recordSummaryFailure(
  admin: Admin,
  input: Pick<WriteSummaryInput, "tenantId" | "recordingId">,
  message: string,
  now: Date = new Date(),
): Promise<void> {
  if (!input.recordingId) {
    return;
  }
  const { error } = await admin
    .from("zoom_recordings")
    .update({ summary_failed_at: now.toISOString(), summary_error: message })
    .eq("id", input.recordingId)
    .eq("tenant_id", input.tenantId);
  if (error) {
    console.error(
      "[summarize-recording] could not record the summary failure",
      input.recordingId,
      error.message,
    );
  }
}

/**
 * Starts writeSummary after the response and returns that work. A failure is
 * logged and recorded on the recording (AIO-593).
 */
export function writeSummaryInBackground(
  input: WriteSummaryInput,
  deps: BackgroundDeps = defaultDeps,
): Promise<void> {
  const work = deps.write(input).then(
    () => {
      console.log("[summarize-recording] summary saved", input.recordingId);
    },
    async (err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        "[summarize-recording] background summary failed",
        input.recordingId,
        message,
      );
      try {
        await recordSummaryFailure(deps.admin(), input, message);
      } catch (markErr) {
        console.error(
          "[summarize-recording] could not record the summary failure",
          input.recordingId,
          markErr instanceof Error ? markErr.message : markErr,
        );
      }
    },
  );
  deps.waitUntil(work);
  return work;
}
