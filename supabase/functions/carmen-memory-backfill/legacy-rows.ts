// Row shapes for backfill selects that name columns missing from the generated
// schema (tasks.description; chat_messages.message/body/text), so the typed
// client cannot infer them. Fields stay unknown and are read defensively.
import { z } from "npm:zod@3.25.76";

const legacyTaskRowSchema = z
  .object({
    id: z.unknown(),
    title: z.unknown(),
    description: z.unknown(),
    status: z.unknown(),
    due_date: z.unknown(),
    created_at: z.unknown(),
    client_id: z.unknown(),
    campaigner_id: z.unknown(),
    assigned_to_campaigner_id: z.unknown(),
  })
  .catch({});

const legacyMessageRowSchema = z
  .object({
    id: z.unknown(),
    message: z.unknown(),
    body: z.unknown(),
    text: z.unknown(),
    provider: z.unknown(),
    direction: z.unknown(),
    sender_name: z.unknown(),
    sender_phone: z.unknown(),
    client_id: z.unknown(),
    lead_id: z.unknown(),
    created_at: z.unknown(),
  })
  .catch({});

export type LegacyTaskRow = z.infer<typeof legacyTaskRowSchema>;
export type LegacyMessageRow = z.infer<typeof legacyMessageRowSchema>;

export function readLegacyTaskRow(raw: unknown): LegacyTaskRow {
  return legacyTaskRowSchema.parse(raw);
}

export function readLegacyMessageRow(raw: unknown): LegacyMessageRow {
  return legacyMessageRowSchema.parse(raw);
}
