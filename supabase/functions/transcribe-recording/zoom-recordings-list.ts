import { z } from "npm:zod@3.25.76";

/** A value that is not an object reads as one with no fields. */
const lenient = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).catch(() => z.object(shape).parse({}));

const recordingFileSchema = lenient({
  recording_type: z.unknown(),
  download_url: z.unknown(),
  play_url: z.unknown(),
});

const meetingSchema = lenient({
  id: z.unknown(),
  uuid: z.unknown(),
  recording_files: z.array(z.unknown()).catch([]),
});

const recordingsListSchema = z.object({ meetings: z.array(z.unknown()) });

const url = z.string().min(1);

function urlsOf(file: z.infer<typeof recordingFileSchema>): string[] {
  return [file.download_url, file.play_url].flatMap((value) => {
    const parsed = url.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
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
  const list = recordingsListSchema.safeParse(listData);
  if (!list.success) return null;
  const matched = list.data.meetings
    .filter((m) => m != null)
    .map((m) => meetingSchema.parse(m))
    .find((m) => String(m.id) === meetingId || String(m.uuid) === meetingId);
  if (matched === undefined) return null;
  const files = matched.recording_files.map((f) =>
    recordingFileSchema.parse(f),
  );
  const targetType = recordingType.toLowerCase();
  const exactType = files.filter(
    (f) => String(f.recording_type || "").toLowerCase() === targetType,
  );
  return [...new Set([...exactType, ...files].flatMap(urlsOf))];
}
