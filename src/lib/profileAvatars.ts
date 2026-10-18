import { supabase } from "@/integrations/supabase/client";

const BUCKET = "entity-attachments";
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export type SkinAvatarMap = Record<string, { avatarPath?: string }>;

export function readSkinAvatars(metadata: unknown): SkinAvatarMap {
  const vi = (metadata as Record<string, unknown> | null)?.visual_identity;
  const skins = (vi as Record<string, unknown> | null | undefined)?.skins;
  if (!skins || typeof skins !== "object") return {};
  const out: SkinAvatarMap = {};
  for (const [slug, v] of Object.entries(skins as Record<string, unknown>)) {
    const p = (v as Record<string, unknown> | null)?.avatarPath;
    if (typeof p === "string") out[slug] = { avatarPath: p };
  }
  return out;
}

export function readActiveSkin(metadata: unknown): string | null {
  const v = (metadata as Record<string, unknown> | null)?.active_skin;
  return typeof v === "string" && v ? v : null;
}

export function validateAvatarFile(file: File): string | null {
  if (!EXT[file.type]) return "יש לבחור PNG, JPG או WebP";
  if (file.size > AVATAR_MAX_BYTES) return "גודל מקסימלי 5MB";
  return null;
}

/** Uploads under `<tenant>/agent-avatars/<folder>/`, which the bucket policy scopes to the caller's tenant. */
export async function uploadProfileImage(
  tenantId: string,
  folder: string,
  file: File,
): Promise<string> {
  const invalid = validateAvatarFile(file);
  if (invalid) throw new Error(invalid);
  const path = `${tenantId}/agent-avatars/${folder}/${crypto.randomUUID()}.${EXT[file.type]}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function signProfileImage(
  tenantId: string,
  path: string | undefined | null,
): Promise<string | undefined> {
  if (!path || !path.startsWith(`${tenantId}/agent-avatars/`)) return undefined;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);
  return error ? undefined : data.signedUrl;
}
