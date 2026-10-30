import { z } from "npm:zod@3.25.76";

const parliamentRequestSchema = z
  .object({
    tenant_id: z.unknown(),
    action: z.unknown(),
    conversation_id: z.unknown(),
    provider: z.unknown(),
    content: z.unknown(),
    question: z.unknown(),
    goal: z.unknown(),
    brain_route_id: z.unknown(),
    idempotency_key: z.unknown(),
    conversation_history: z.unknown(),
  })
  .catch({});

/** Request body fields; values are unvalidated client JSON. */
export type ParliamentRequest = z.infer<typeof parliamentRequestSchema>;

/** Field view of a parsed JSON body; a non-object body reads as having no fields. */
export function readParliamentRequest(raw: unknown): ParliamentRequest {
  return parliamentRequestSchema.parse(raw);
}

const historyMessageSchema = z
  .object({ role: z.unknown(), content: z.unknown() })
  .transform((m) => ({
    role: String(m.role),
    content: String(m.content || ""),
  }));

export type HistoryMessage = z.infer<typeof historyMessageSchema>;

/** Object entries of conversation_history as role/content text, the way the direct prompt renders them. */
export function readHistory(value: unknown): HistoryMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = historyMessageSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
