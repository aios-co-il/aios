import { supabase } from "@/integrations/supabase/client";
import {
  presignedUrlStillValid,
  recordingNeedsRecallRefresh,
} from "@/lib/recordingPlayback";

export interface ExternalRecordingRef {
  id: string;
  source: string | null;
  file_path: string | null;
  recording_url: string | null;
}

const REFRESH_FAILED = "לא הצלחנו לחדש את קישור ההקלטה. נסה שוב.";

async function readInvokeError(
  error: { context?: { json?: () => Promise<{ error?: string }> } } | null,
): Promise<string> {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    /* the gateway error has no JSON body */
  }
  return REFRESH_FAILED;
}

/** Open during the click so the later navigation is not treated as a popup. */
export function beginExternalOpen(): Window | null {
  const pending = window.open("about:blank", "_blank");
  if (pending) pending.opener = null;
  return pending;
}

export function finishExternalOpen(url: string, pending: Window | null) {
  if (pending) {
    pending.location.replace(url);
    return;
  }
  const opened = window.open(url, "_blank");
  if (opened) opened.opener = null;
}

export function cancelExternalOpen(pending: Window | null) {
  pending?.close();
}

/** Re-issue a Recall download URL when the stored one is missing or expired. */
export async function resolveExternalRecordingUrl(
  rec: ExternalRecordingRef,
): Promise<string | null> {
  const stored = rec.recording_url;
  if (!recordingNeedsRecallRefresh(rec)) return stored;
  if (stored && presignedUrlStillValid(stored)) return stored;

  const { data, error } = await supabase.functions.invoke(
    "refresh-recording-playback",
    {
      body: { recording_id: rec.id },
    },
  );
  if (typeof data?.url === "string" && data.url) return data.url;
  if (typeof data?.error === "string" && data.error)
    throw new Error(data.error);
  throw new Error(await readInvokeError(error));
}
