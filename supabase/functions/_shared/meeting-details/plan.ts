// What to write after reading a meeting summary (AIO-563): the name unless a
// person typed one, the client only on a recording nobody has assigned.

const MAX_TITLE_CHARS = 80;

export interface MeetingDetails {
  title: string | null;
  clientId: string | null;
}

export interface ClientOption {
  id: string;
  name: string;
  agency_id: string | null;
}

export interface RecordingAssignment {
  meeting_topic: string | null;
  topic_set_manually: boolean;
  client_id: string | null;
  lead_id: string | null;
  campaigner_ids: Array<string> | null;
  summary_scope: string | null;
}

/**
 * What to write for these details: the name unless a person typed one, and the
 * client only when the caller says the recording was unrecognized
 * (`assignClient`) and it has no client, lead or team-member assignment. An
 * agency scope a person chose is never reclassified as a client meeting.
 */
export function planMeetingDetailsUpdate(
  recording: RecordingAssignment,
  details: MeetingDetails,
  clients: Array<ClientOption>,
  { assignClient }: { assignClient: boolean },
): {
  topic: string | null;
  client: {
    client_id: string;
    agency_id: string | null;
    summary_scope: "client";
    suggested_client_id: null;
  } | null;
} {
  const title = details.title?.trim() || null;
  const topic =
    title && !recording.topic_set_manually && title !== recording.meeting_topic
      ? title
      : null;

  const client = clients.find((c) => c.id === details.clientId) ?? null;
  const unassigned =
    assignClient &&
    !recording.client_id &&
    !recording.lead_id &&
    !recording.campaigner_ids?.length &&
    recording.summary_scope !== "campaigner" &&
    recording.summary_scope !== "lead";
  return {
    topic,
    client:
      client && unassigned
        ? {
            client_id: client.id,
            agency_id: client.agency_id,
            summary_scope: "client",
            suggested_client_id: null,
          }
        : null,
  };
}

/** Validates the model's JSON: a short name, and a client id from the list only. */
export function parseMeetingDetails(
  raw: unknown,
  clients: Array<ClientOption>,
): MeetingDetails {
  if (!raw || typeof raw !== "object") {
    return { title: null, clientId: null };
  }
  const record = raw as Record<string, unknown>;
  const title =
    typeof record.title === "string" && record.title.trim()
      ? record.title.trim().slice(0, MAX_TITLE_CHARS)
      : null;
  const clientId =
    typeof record.client_id === "string" &&
    clients.some((c) => c.id === record.client_id)
      ? record.client_id
      : null;
  return { title, clientId };
}
