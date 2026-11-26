import { supabase } from "@/integrations/supabase/client";
import { COMMAND_CENTER_FILES_BUCKET } from "../../supabase/functions/_shared/agent-channel/attachment-bucket.ts";
import type { ChannelAttachment } from "../../supabase/functions/_shared/agent-channel/types.ts";
import type { TurnPictureAttachment } from "../../supabase/functions/run-ai-agent/attachments/contract.ts";

/** A file attached in the Command Center chat: the shape the edge functions define. */
export type CommandCenterAttachment = ChannelAttachment;

const BUCKET = COMMAND_CENTER_FILES_BUCKET;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 6;
const ACCEPT =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.webp,.png,.jpg,.jpeg,.gif";

export const COMMAND_CENTER_FILE_ACCEPT = ACCEPT;
export const COMMAND_CENTER_MAX_FILES = MAX_FILES;

function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name)
  );
}

export function formatAttachmentsForPrompt(
  attachments: Array<CommandCenterAttachment>,
  userText?: string,
): string {
  const lines = attachments.map((a) => {
    const label = a.type === "image" ? "תמונה" : "קובץ";
    return `- ${label}: ${a.name} → ${a.url}`;
  });
  const body = lines.join("\n");
  const prefix = userText?.trim() ? `${userText.trim()}\n\n` : "";
  return `${prefix}📎 קבצים מצורפים (${attachments.length}):\n${body}`;
}

/**
 * What Carmen's own loop (run-ai-agent) is sent for a message with attachments (AIO-675).
 * The text is what it always was, every attachment a line with its link: the workshop reads
 * an attached picture's line as the look to follow (`referenceThisTurn`), and her tools that
 * save or rework a picture take its address from there. Each picture also goes by storage
 * path, so the server reads the bytes itself and shows them to a brain that can see.
 */
export function carmenTurn(
  attachments: Array<CommandCenterAttachment>,
  typedText: string,
): { commandText: string; pictures: Array<TurnPictureAttachment> } {
  const text = typedText.trim();
  const pictures = attachments.flatMap(({ name, path, type, size }) =>
    type === "image" && path ? [{ name, path, type, size }] : [],
  );

  return {
    commandText: attachments.length
      ? formatAttachmentsForPrompt(attachments, text)
      : text,
    pictures,
  };
}

export async function uploadCommandCenterAttachments(
  files: FileList | Array<File>,
  userId: string,
): Promise<Array<CommandCenterAttachment>> {
  const list = Array.from(files).slice(0, MAX_FILES);
  const out: Array<CommandCenterAttachment> = [];

  for (const file of list) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`הקובץ ${file.name} גדול מ-15MB`);
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData, error: urlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (urlError || !urlData?.signedUrl) {
      throw urlError ?? new Error("Failed to sign attachment URL");
    }

    out.push({
      name: file.name,
      url: urlData.signedUrl,
      type: isImageFile(file) ? "image" : "file",
      size: file.size,
      path,
    });
  }

  return out;
}
