import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import type { CommandCenterAttachment } from "@/lib/commandCenterAttachments";

const attachmentSchema = z.object({
  name: z.string(),
  url: z.string(),
  type: z.enum(["image", "file"]),
  size: z.number().optional().catch(undefined),
  path: z.string().optional().catch(undefined),
});

const metadataSchema = z.object({ attachments: z.array(z.unknown()) });

/** Attachments stored on a message's metadata; malformed entries are skipped. */
export function attachmentsFromMetadata(
  metadata: Json | undefined,
): CommandCenterAttachment[] | undefined {
  const parsed = metadataSchema.safeParse(metadata);
  if (!parsed.success) return undefined;
  return parsed.data.attachments.flatMap((entry) => {
    const attachment = attachmentSchema.safeParse(entry);
    return attachment.success ? [attachment.data] : [];
  });
}
