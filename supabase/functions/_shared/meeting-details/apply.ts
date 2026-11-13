// Names a meeting and assigns its client from its saved summary (AIO-563), on
// every recording of the same meeting in the tenant.
import type { DbClient } from "../supabase-clients.ts";
import { extractMeetingDetails, type MeetingDetailsKeys } from "./extract.ts";
import {
  type ClientOption,
  planMeetingDetailsUpdate,
  type RecordingAssignment,
} from "./plan.ts";

export interface MeetingDetailsOutcome {
  title: string | null;
  clientId: string | null;
  topicUpdated: boolean;
  clientAssigned: boolean;
}

type Recording = RecordingAssignment & { id: string; meeting_id: string };

/**
 * Reads the summary, then writes the meeting name and, with `assignClient`, the
 * client per planMeetingDetailsUpdate. With `dryRun` it only reports what it
 * would write.
 */
export async function applyMeetingDetailsFromSummary(
  admin: Pick<DbClient, "from">,
  opts: {
    tenantId: string;
    recordingId: string;
    summary: string;
    keys: MeetingDetailsKeys;
    /** False keeps the recording's assignment and only names the meeting. */
    assignClient: boolean;
    /** False keeps the recording's name (see planMeetingDetailsUpdate). */
    renameMeeting?: boolean;
    dryRun?: boolean;
  },
): Promise<MeetingDetailsOutcome> {
  const recording = await loadRecording(admin, opts.tenantId, opts.recordingId);
  const clients = await loadClients(admin, opts.tenantId);
  const details = await extractMeetingDetails(opts.summary, clients, opts.keys);
  const update = planMeetingDetailsUpdate(recording, details, clients, {
    assignClient: opts.assignClient,
    renameMeeting: opts.renameMeeting,
  });
  if (!opts.dryRun) {
    await writeUpdate(admin, opts.tenantId, recording.meeting_id, update);
  }
  return {
    ...details,
    topicUpdated: !!update.topic,
    clientAssigned: !!update.client,
  };
}

/** Writes the planned name and client to every recording of the meeting. */
async function writeUpdate(
  admin: Pick<DbClient, "from">,
  tenantId: string,
  meetingId: string,
  update: ReturnType<typeof planMeetingDetailsUpdate>,
): Promise<void> {
  if (update.topic) {
    const { error } = await admin
      .from("zoom_recordings")
      .update({ meeting_topic: update.topic })
      .eq("tenant_id", tenantId)
      .eq("meeting_id", meetingId)
      .eq("topic_set_manually", false);
    if (error) {
      throw new Error(`meeting name update failed: ${error.message}`);
    }
  }
  if (update.client) {
    const { error } = await admin
      .from("zoom_recordings")
      .update(update.client)
      .eq("tenant_id", tenantId)
      .eq("meeting_id", meetingId)
      .is("client_id", null)
      .is("lead_id", null);
    if (error) {
      throw new Error(`client assignment failed: ${error.message}`);
    }
  }
}

/** The recording's current name and assignment, tenant-scoped. */
async function loadRecording(
  admin: Pick<DbClient, "from">,
  tenantId: string,
  recordingId: string,
): Promise<Recording> {
  const { data, error } = await admin
    .from("zoom_recordings")
    .select(
      "id, meeting_id, meeting_topic, topic_set_manually, client_id, lead_id, campaigner_ids, summary_scope",
    )
    .eq("tenant_id", tenantId)
    .eq("id", recordingId)
    .maybeSingle();
  if (error) {
    throw new Error(`recording lookup failed: ${error.message}`);
  }
  if (!data) {
    throw new Error(`recording ${recordingId} not found in tenant`);
  }
  return data;
}

/** The tenant's clients with their agency. */
async function loadClients(
  admin: Pick<DbClient, "from">,
  tenantId: string,
): Promise<Array<ClientOption>> {
  const { data, error } = await admin
    .from("clients")
    .select("id, name, agency_id")
    .eq("tenant_id", tenantId);
  if (error) {
    throw new Error(`client list failed: ${error.message}`);
  }
  return data ?? [];
}
