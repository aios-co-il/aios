import { z } from "zod";

const optionalString = z.string().optional().catch(undefined);

const outputItemSchema = z.object({
  type: z.unknown(),
  name: z.unknown(),
  arguments: z.unknown(),
  call_id: z.unknown(),
});

const serverEventSchema = z.object({
  type: z.unknown(),
  delta: optionalString,
  transcript: optionalString,
  item: outputItemSchema.optional().catch(undefined),
  error: z.object({ message: optionalString }).optional().catch(undefined),
});

const askCarmenArgsSchema = z.object({ question: z.string() });

export type RealtimeServerEvent = z.infer<typeof serverEventSchema>;

/** A data-channel message from OpenAI Realtime, or null when it is not a JSON object. */
export function parseRealtimeServerEvent(
  data: string,
): RealtimeServerEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  const parsed = serverEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The `question` of an ask_carmen function call; empty when the arguments are malformed. */
export function readAskCarmenQuestion(rawArguments: unknown): string {
  let raw: unknown;
  try {
    raw = JSON.parse(String(rawArguments));
  } catch {
    return "";
  }
  const parsed = askCarmenArgsSchema.safeParse(raw);
  return parsed.success ? parsed.data.question : "";
}
