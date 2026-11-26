import { z } from "npm:zod@3.25.76";

/** zod drops every other key, so tokens in the response never reach the log. */
const tokenErrorSchema = z.object({
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export type TokenErrorSummary = z.infer<typeof tokenErrorSchema>;

/** The failure fields of Google's token endpoint response, safe to log. */
export function tokenErrorSummary(response: unknown): TokenErrorSummary {
  const parsed = tokenErrorSchema.safeParse(response);

  return parsed.success ? parsed.data : {};
}
