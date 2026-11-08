import { z } from "npm:zod@3.25.76";

const parliamentRequestSchema = z
  .object({
    tenant_id: z.string().optional().catch(undefined),
    action: z.string().optional().catch(undefined),
    conversation_id: z.string().optional().catch(undefined),
    provider: z.string().optional().catch(undefined),
    content: z.string().optional().catch(undefined),
    question: z.string().optional().catch(undefined),
    goal: z.string().optional().catch(undefined),
    brain_route_id: z.string().optional().catch(undefined),
    idempotency_key: z.string().optional().catch(undefined),
    conversation_history: z.unknown(),
  })
  .catch({});

/** Validated fields consumed by the parliament handler. */
export type ParliamentRequest = z.infer<typeof parliamentRequestSchema>;

/** Field view of a parsed JSON body; a non-object body reads as having no fields. */
export function readParliamentRequest(raw: unknown): ParliamentRequest {
  return parliamentRequestSchema.parse(raw);
}

const historyMessageSchema = z.object({
  role: z.string(),
  content: z.string().optional().default(""),
});

export type HistoryMessage = z.infer<typeof historyMessageSchema>;

/** Object entries of conversation_history as role/content text, the way the direct prompt renders them. */
export function readHistory(value: unknown): HistoryMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(-12).flatMap((item) => {
    const parsed = historyMessageSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
