import { z } from "npm:zod@3.25.76";
import { gmailIdSchema } from "./gmail-attachments.ts";

/** Reads the chosen messages and suggests invoice rows; stores nothing. */
const extractRequestSchema = z.object({
  tenantId: z.string().uuid(),
  messageIds: z.array(gmailIdSchema).min(1),
});

/** Stores the attachments of the rows the user saved. */
const storeRequestSchema = z.object({
  action: z.literal("store"),
  tenantId: z.string().uuid(),
  files: z
    .array(z.object({ messageId: gmailIdSchema, partId: gmailIdSchema }))
    .min(1),
});

export const invoiceRequestSchema = z.union([
  storeRequestSchema,
  extractRequestSchema,
]);
