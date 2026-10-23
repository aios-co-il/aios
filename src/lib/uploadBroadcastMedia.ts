import { supabase } from "@/integrations/supabase/client";
import { requireTenantId } from "@/lib/requireTenantId";

const BUCKET = "broadcast-media";

/**
 * Upload a file to the public broadcast-media bucket under
 * `<tenant>/<folder>/<name>` and return its storage path and public URL.
 * `name` defaults to a random UUID with the file's extension.
 */
export async function uploadBroadcastMedia(
  tenantId: string | null | undefined,
  folder: "templates" | "attachments" | "broadcasts",
  file: File,
  opts: { name?: string; upsert?: boolean } = {},
): Promise<{ path: string; url: string }> {
  const ext = file.name.split(".").pop() || "bin";
  const name = opts.name ?? `${crypto.randomUUID()}.${ext}`;
  const path = `${requireTenantId(tenantId)}/${folder}/${name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: opts.upsert ?? false,
  });
  if (error) throw error;
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return { path, url };
}
