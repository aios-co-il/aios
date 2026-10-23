// Validates incoming recording URLs and stores uploaded audio in the private
// call-recordings bucket, under the tenant's folder (read via signed URLs).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { WebhookError } from "./errors.ts";

export const RECORDINGS_BUCKET = "call-recordings";
const MAX_RECORDING_BYTES = 50 * 1024 * 1024;
const AUDIO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/gsm": "gsm",
};

export function validateRecordingUrl(url: string | null): string | null {
  if (url && !/^https?:\/\//i.test(url))
    throw new WebhookError("recording_url must be an http(s) URL", 400);
  return url;
}

/** Stores the file and returns its storage path. */
export async function storeRecordingFile(
  sb: SupabaseClient,
  tenantId: string,
  file: File,
): Promise<string> {
  if (file.size > MAX_RECORDING_BYTES)
    throw new WebhookError("Recording file too large (max 50MB)", 413);
  const ext = audioExtension(file);
  const path = `${tenantId}/pbx/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage
    .from(RECORDINGS_BUCKET)
    .upload(path, file, { contentType: file.type || `audio/${ext}` });
  if (error) {
    console.error("pbx-webhook upload error:", error);
    throw new WebhookError("Failed to store recording", 500);
  }
  return path;
}

function audioExtension(file: File): string {
  const fromType = AUDIO_EXT[(file.type || "").toLowerCase()];
  const fromName = (file.name.split(".").pop() || "").toLowerCase();
  const ext =
    fromType ||
    (/^(mp3|wav|ogg|webm|m4a|aac|gsm)$/.test(fromName) ? fromName : null);
  if (!ext) throw new WebhookError("Recording must be an audio file", 415);
  return ext;
}
