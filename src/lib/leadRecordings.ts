/** Private bucket for call audio uploaded by the PBX webhook. */
export const CALL_RECORDINGS_BUCKET = "call-recordings";

export type StoredCallRecording = {
  id: string;
  lead_id: string | null;
  recording_url: string | null;
  recording_path?: string | null;
};

export type StoredFileRecording = {
  id: string;
  lead_id: string | null;
  source: string | null;
  meeting_topic: string | null;
  recording_url: string | null;
  file_path: string | null;
};

export type LeadRecordingItem = {
  id: string;
  label: string;
  url: string | null;
  filePath: string | null;
  /** Storage bucket for filePath; defaults to "recordings". */
  bucket?: string;
};

function withIndex(base: string, index: number, total: number): string {
  return total > 1 ? `${base} ${index + 1}` : base;
}

export function buildLeadRecordingItems(
  calls: StoredCallRecording[],
  files: StoredFileRecording[],
): LeadRecordingItem[] {
  const automatic = calls.filter(
    (call) => call.recording_url || call.recording_path,
  );
  const stored = files.filter((file) => file.recording_url || file.file_path);
  const manual = stored.filter((file) => file.source === "manual");
  const other = stored.filter((file) => file.source !== "manual");

  return [
    ...automatic.map((call, index) => ({
      id: `call:${call.id}`,
      label: withIndex("הקלטה אוטומטית", index, automatic.length),
      url: call.recording_url,
      filePath: call.recording_path ?? null,
      ...(call.recording_path && { bucket: CALL_RECORDINGS_BUCKET }),
    })),
    ...other.map((file, index) => ({
      id: `file:${file.id}`,
      label: withIndex(
        file.meeting_topic?.trim() || "הקלטה",
        index,
        other.length,
      ),
      url: file.recording_url,
      filePath: file.file_path,
    })),
    ...manual.map((file, index) => ({
      id: `manual:${file.id}`,
      label: withIndex("הקלטה ידנית", index, manual.length),
      url: file.recording_url,
      filePath: file.file_path,
    })),
  ];
}

export function groupLeadRecordings(
  calls: StoredCallRecording[],
  files: StoredFileRecording[],
): Record<string, LeadRecordingItem[]> {
  const callBuckets = new Map<string, StoredCallRecording[]>();
  const fileBuckets = new Map<string, StoredFileRecording[]>();
  for (const call of calls) {
    if (!call.lead_id) continue;
    const bucket = callBuckets.get(call.lead_id) ?? [];
    bucket.push(call);
    callBuckets.set(call.lead_id, bucket);
  }
  for (const file of files) {
    if (!file.lead_id) continue;
    const bucket = fileBuckets.get(file.lead_id) ?? [];
    bucket.push(file);
    fileBuckets.set(file.lead_id, bucket);
  }
  const leadIds = new Set([...callBuckets.keys(), ...fileBuckets.keys()]);
  const grouped: Record<string, LeadRecordingItem[]> = {};
  for (const leadId of leadIds) {
    grouped[leadId] = buildLeadRecordingItems(
      callBuckets.get(leadId) ?? [],
      fileBuckets.get(leadId) ?? [],
    );
  }
  return grouped;
}
