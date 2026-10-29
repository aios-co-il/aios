import { z } from "npm:zod@3.25.76";

/** A clients/leads row carrying the fields send-chat-message reads. */
const chatContactSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  manychat_subscriber_id: z.string().nullish(),
  tenant_id: z.string(),
});

export interface ChatContact {
  id: string;
  name: string | null;
  manychat_subscriber_id: string | null;
  tenant_id: string;
}

export function isChatContact(value: unknown): value is ChatContact {
  return chatContactSchema.safeParse(value).success;
}
