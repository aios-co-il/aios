import { z } from "npm:zod@3.25.76";
import type { ChannelAttachment } from "./types.ts";

const inputModeSchema = z
  .enum([
    "typed",
    "realtime_voice",
    "transcribe_only",
    "external_channel_callback",
  ])
  .catch("typed");

export function parseInputMode(raw: unknown) {
  return inputModeSchema.parse(raw);
}

const historyMessageSchema = z
  .object({ role: z.unknown(), content: z.unknown() })
  .transform((m) => ({
    role: String(m.role),
    content: String(m.content || ""),
  }));

export type HistoryMessage = z.infer<typeof historyMessageSchema>;

const conversationHistorySchema = z
  .array(z.unknown())
  .catch([])
  .transform((items) =>
    items.flatMap((item) => {
      const parsed = historyMessageSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  );

/** Object entries keep their role/content as text, the way the direct prompt renders them. */
export function parseConversationHistory(raw: unknown): HistoryMessage[] {
  return conversationHistorySchema.parse(raw);
}

const attachmentText = z.unknown().transform((v) => String(v || "").trim());

const attachmentSchema = z
  .object({
    name: attachmentText,
    url: attachmentText,
    type: z
      .unknown()
      .transform((v): ChannelAttachment["type"] =>
        v === "image" ? "image" : "file",
      ),
    size: z.number().optional().catch(undefined),
    path: z.string().optional().catch(undefined),
  })
  .refine((a) => a.name && a.url.startsWith("http"));

/** Up to 6 attachments with a name and an http(s) url; malformed items are skipped. */
export function parseAttachments(raw: unknown): ChannelAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((item) => {
      const parsed = attachmentSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, 6);
}
