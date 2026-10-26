import type { Json } from "@/integrations/supabase/types";
import type { CommandCenterAttachment } from "@/lib/commandCenterAttachments";
import { asJsonObject } from "@/lib/jsonObject";

function toAttachment(value: Json): CommandCenterAttachment | null {
  const a = asJsonObject(value);
  if (!a || typeof a.name !== "string" || typeof a.url !== "string")
    return null;
  if (a.type !== "image" && a.type !== "file") return null;
  return {
    name: a.name,
    url: a.url,
    type: a.type,
    ...(typeof a.size === "number" ? { size: a.size } : {}),
    ...(typeof a.path === "string" ? { path: a.path } : {}),
  };
}

/** Attachments stored on a message's metadata; malformed entries are skipped. */
export function attachmentsFromMetadata(
  metadata: Json | undefined,
): CommandCenterAttachment[] | undefined {
  const list = asJsonObject(metadata)?.attachments;
  if (!Array.isArray(list)) return undefined;
  return list.flatMap((entry) => {
    const attachment = toAttachment(entry);
    return attachment ? [attachment] : [];
  });
}
