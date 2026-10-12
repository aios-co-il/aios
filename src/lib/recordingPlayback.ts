/** Recall keeps the mp4 on its own bucket and hands back a short-lived S3 URL. */
export function isRecallRecordingUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("recallai") || host.endsWith("recall.ai");
  } catch {
    return /recallai|recall\.ai/i.test(url);
  }
}

/**
 * Carmen meeting-bot rows that never landed in Storage only have Recall's
 * presigned URL. That URL expires (typically after 6 hours) and must be
 * re-issued from the bot before playback.
 */
export function recordingNeedsRecallRefresh(rec: {
  source: string | null;
  file_path: string | null;
  recording_url: string | null;
}): boolean {
  if (rec.file_path) return false;
  return rec.source === "meeting_bot" || isRecallRecordingUrl(rec.recording_url);
}

/** True only when the AWS signature is still inside its X-Amz-Expires window. */
export function presignedUrlStillValid(url: string, now = Date.now(), skewMs = 60_000): boolean {
  try {
    const params = new URL(url).searchParams;
    const expires = Number(params.get("X-Amz-Expires"));
    const date = params.get("X-Amz-Date");
    if (!Number.isFinite(expires) || expires <= 0 || !date || !/^\d{8}T\d{6}Z$/.test(date)) return false;
    const start = Date.parse(
      `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`,
    );
    if (!Number.isFinite(start)) return false;
    return now + skewMs < start + expires * 1000;
  } catch {
    return false;
  }
}
