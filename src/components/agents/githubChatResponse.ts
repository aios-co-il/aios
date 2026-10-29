import { z } from "zod";

const text = z
  .union([z.string(), z.number()])
  .transform(String)
  .optional()
  .catch(undefined);

const chatSupportResponseSchema = z.object({
  response: text,
  action_needed: text,
  requires_approval: z.unknown().transform(Boolean),
  severity: text,
});

export type ChatSupportResponse = z.infer<typeof chatSupportResponseSchema>;

/** github-agent chat_support reply; null when the body is not an object. */
export function parseChatSupportResponse(
  data: unknown,
): ChatSupportResponse | null {
  const parsed = chatSupportResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
