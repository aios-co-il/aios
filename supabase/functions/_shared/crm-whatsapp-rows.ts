import { z } from "npm:zod@3.25.76";

const integrationRowSchema = z.object({
  id: z.string().min(1),
  integration_type: z.string(),
  user_id: z.string().nullable().catch(null),
});

export type IntegrationRow = z.infer<typeof integrationRowSchema>;

/** tenant_integrations rows (id, integration_type, user_id) with string ids only. */
export const integrationRows = (data: unknown): IntegrationRow[] =>
  z
    .array(z.unknown())
    .catch([])
    .parse(data)
    .flatMap((row) => {
      const parsed = integrationRowSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
