import { supabase } from "@/integrations/supabase/client";

const PUBLIC_RECORDINGS_PATH = "/storage/v1/object/public/recordings/";
const SIGNED_URL_SECONDS = 60 * 60;

/**
 * The object path of a public URL into the recordings bucket, or null. The
 * bucket turned private in AIO-595; a few older summaries and client
 * attachments still store such URLs.
 */
export function publicRecordingPath(url: string): string | null {
  const index = url.indexOf(PUBLIC_RECORDINGS_PATH);
  if (index < 0) {
    return null;
  }
  const path = url.slice(index + PUBLIC_RECORDINGS_PATH.length).split("?")[0];
  return path ? decodeURIComponent(path) : null;
}

/**
 * A URL the browser can open: a stored public recordings URL is replaced by a
 * short-lived signed one (RLS checks the tenant folder); any other URL is
 * returned as is.
 */
export async function openableRecordingUrl(url: string): Promise<string> {
  const path = publicRecordingPath(url);
  if (!path) {
    return url;
  }
  const { data, error } = await supabase.storage
    .from("recordings")
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) {
    throw error ?? new Error(`No signed URL for ${path}`);
  }
  return data.signedUrl;
}
