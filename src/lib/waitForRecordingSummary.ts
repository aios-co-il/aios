import { supabase } from "@/integrations/supabase/client";

const POLL_MS = 10_000;
const TIMEOUT_MS = 8 * 60_000;

export interface SavedSummary {
  summary: string;
  fileUrl: string | null;
}

/**
 * Waits for a summary written in the background (AIO-581) to land on the
 * recording: resolves once `summary_generated_at` is later than `since`, or
 * null after the timeout (the summary may still arrive later).
 */
export async function waitForRecordingSummary(
  recordingId: string,
  since: Date,
  options: { pollMs?: number; timeoutMs?: number } = {},
): Promise<SavedSummary | null> {
  const pollMs = options.pollMs ?? POLL_MS;
  const deadline = Date.now() + (options.timeoutMs ?? TIMEOUT_MS);
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const { data, error } = await supabase
      .from("zoom_recordings")
      .select("summary_md, summary_file_url, summary_generated_at")
      .eq("id", recordingId)
      .maybeSingle();
    if (error) {
      console.error("[waitForRecordingSummary] poll failed", error.message);
      continue;
    }
    if (isNewSummary(data, since)) {
      return { summary: data.summary_md, fileUrl: data.summary_file_url };
    }
  }
  return null;
}

/**
 * The server's request time from a pending reply (AIO-581), or the browser's
 * time from before the request when an older function omits it.
 */
export function pendingSince(
  data: { requested_at?: unknown } | null,
  fallback: Date,
): Date {
  const serverTime =
    typeof data?.requested_at === "string" ? new Date(data.requested_at) : null;
  return serverTime && !Number.isNaN(serverTime.getTime())
    ? serverTime
    : fallback;
}

/** True when the row carries a summary generated after `since`. */
export function isNewSummary(
  row: {
    summary_md: string | null;
    summary_generated_at: string | null;
  } | null,
  since: Date,
): row is { summary_md: string; summary_generated_at: string } & {
  summary_file_url: string | null;
} {
  return (
    !!row?.summary_md &&
    !!row.summary_generated_at &&
    new Date(row.summary_generated_at).getTime() > since.getTime()
  );
}
