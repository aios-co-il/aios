import { z } from "npm:zod@3.25.76";
const text = z.string().nullish().catch(undefined);
const identity = { id: z.string() };
export const clientMemorySchema = z.object({
  ...identity,
  name: text,
  industry: text,
  status: text,
  mood_status: text,
  tier: text,
  contact_name: text,
  agency_id: text,
});
export const campaignerMemorySchema = z.object({
  ...identity,
  full_name: text,
  role: z
    .union([z.string(), z.array(z.string())])
    .nullish()
    .catch(undefined),
  phone: text,
  active: z.boolean().nullish().catch(undefined),
});
export const taskMemorySchema = z.object({
  ...identity,
  title: text,
  description: text,
  notes: text,
  status: text,
  due_date: text,
  created_at: text,
  client_id: text,
  campaigner_id: text,
  assigned_to_campaigner_id: text,
});
export const chatMemorySchema = z.object({
  ...identity,
  message: text,
  message_text: text,
  body: text,
  text,
  provider: text,
  direction: text,
  sender_name: text,
  sender_phone: text,
  client_id: text,
  lead_id: text,
  group_id: text,
  created_at: text,
});
const messageSchema = z.object({ role: z.string(), content: z.string() });
const messagesSchema = z
  .array(z.unknown())
  .catch([])
  .transform((entries) =>
    entries.flatMap((entry) => {
      const parsed = messageSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    }),
  );
export const conversationMemorySchema = z.object({
  ...identity,
  title: text,
  messages: messagesSchema,
  created_at: text,
  updated_at: text,
  user_id: text,
});
export type ClientMemory = z.infer<typeof clientMemorySchema>;
export type CampaignerMemory = z.infer<typeof campaignerMemorySchema>;
export type TaskMemory = z.infer<typeof taskMemorySchema>;
export type ChatMemory = z.infer<typeof chatMemorySchema>;
export type ConversationMemory = z.infer<typeof conversationMemorySchema>;
/** Read stored conversation messages without exposing arbitrary JSON keys. */
export function readMemoryMessages(value: unknown) {
  return messagesSchema.parse(value);
}
