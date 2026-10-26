import { unknownField } from "../_shared/json-fields.ts";

function filesOf(meeting: unknown): unknown[] {
  const files = unknownField(meeting, "recording_files");
  return Array.isArray(files) ? files : [];
}

function urlsOf(file: unknown): string[] {
  return [unknownField(file, "download_url"), unknownField(file, "play_url")]
    .filter((url) => typeof url === "string" && url !== "")
    .map(String);
}

/**
 * Download/play URLs of the meeting's recording files in a Zoom
 * users/me/recordings response, files of `recordingType` first.
 * Null when the meeting is not in the list.
 */
export function freshZoomRecordingUrls(
  listData: unknown,
  meetingId: string,
  recordingType: string,
): string[] | null {
  const meetings = unknownField(listData, "meetings");
  if (!Array.isArray(meetings)) return null;
  const matched = meetings.find(
    (m) =>
      m != null &&
      (String(unknownField(m, "id")) === meetingId ||
        String(unknownField(m, "uuid")) === meetingId),
  );
  if (matched === undefined) return null;
  const files = filesOf(matched);
  const targetType = recordingType.toLowerCase();
  const exactType = files.filter(
    (f) =>
      String(unknownField(f, "recording_type") || "").toLowerCase() ===
      targetType,
  );
  return [...new Set([...exactType, ...files].flatMap(urlsOf))];
}
