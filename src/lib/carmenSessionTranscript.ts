import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

const sessionMessageSchema = z.object({
  role: z.string().catch(""),
  content: z.string().catch(""),
  timestamp: z.string().optional().catch(undefined),
});

export type SessionMessage = z.infer<typeof sessionMessageSchema>;

const renderableSchema = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .optional()
  .catch(undefined);

const transcriptEntrySchema = z
  .object({
    role: renderableSchema,
    direction: renderableSchema,
    content: renderableSchema,
    message: renderableSchema,
    text: renderableSchema,
  })
  .catch({});

const transcriptSchema = z.array(transcriptEntrySchema).catch([]);

export type TranscriptLine = {
  fromAssistant: boolean;
  speaker: z.infer<typeof renderableSchema>;
  text: z.infer<typeof renderableSchema>;
};

/** Reads a stored chat transcript; entries that are not objects are skipped. */
export function toSessionMessages(
  value: Json | null | undefined,
): SessionMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const message = sessionMessageSchema.safeParse(entry);
    return message.success ? [message.data] : [];
  });
}

/**
 * Reads a WhatsApp session transcript for display. Nested objects are not
 * renderable and are dropped; non-object entries become empty lines.
 */
export function toTranscriptLines(
  value: Json | null | undefined,
): TranscriptLine[] {
  return transcriptSchema.parse(value).map((m) => ({
    fromAssistant: m.role === "assistant" || m.direction === "outbound",
    speaker: m.role || m.direction,
    text: m.content || m.message || m.text,
  }));
}
