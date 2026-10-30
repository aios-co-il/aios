import { z } from "npm:zod@3.25.76";
import { parseCallbackEventType } from "../_shared/agent-channel/logic.ts";
import { unknownRecordSchema } from "../_shared/unknown-record.ts";

const trimmedText = z.unknown().transform((v) => String(v || "").trim());
const optionalText = z.unknown().transform((v) => (v ? String(v) : undefined));

const callbackBodySchema = unknownRecordSchema.catch({}).pipe(
  z.object({
    conversation_id: trimmedText,
    session_id: trimmedText,
    content: trimmedText,
    tenant_id: z.unknown(),
    origin: z.string().nullish().catch(null),
    event_type: z.unknown().transform(parseCallbackEventType),
    speaker: optionalText,
    idempotency_key: optionalText,
    external_message_id: optionalText,
    parliament_round: z.number().optional().catch(undefined),
    metadata: unknownRecordSchema.catch({}),
  }),
);

export type CallbackBody = z.infer<typeof callbackBodySchema>;

export function parseCallbackBody(raw: unknown): CallbackBody {
  return callbackBodySchema.parse(raw);
}
