// Pure helpers for WhatsApp → direct channel routing (unit-tested under node).
import { asRecord } from "../unknown-record.ts";

export type WhatsAppDirectProvider = "claude" | "cursor";

export type WhatsAppReplyTarget = {
  integration_id: string;
  phone_number: string;
  connection_user_id: string;
};

const TRIGGERS: Array<{ provider: WhatsAppDirectProvider; pattern: RegExp }> = [
  {
    provider: "claude",
    pattern: /^\s*(?:קלוד|claude)(?=$|[\s,:.!?\-–—])[\s,:.!?\-–—]*/i,
  },
  {
    provider: "cursor",
    pattern: /^\s*(?:קרסר|cursor)(?=$|[\s,:.!?\-–—])[\s,:.!?\-–—]*/i,
  },
];

const OWNER_ROLES = new Set(["owner", "super_admin"]);
export const LABEL: Record<WhatsAppDirectProvider, string> = {
  claude: "Claude",
  cursor: "Cursor",
};

export function parseWhatsAppDirectCommand(
  text: string | null | undefined,
): { provider: WhatsAppDirectProvider; content: string } | null {
  const raw = String(text || "");
  for (const { provider, pattern } of TRIGGERS) {
    const match = raw.match(pattern);
    if (!match) continue;
    const content = raw.slice(match[0].length).trim();
    return content ? { provider, content } : null;
  }
  return null;
}

function phoneTail(value: unknown): string {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(-9);
}

/** Only the WhatsApp connection owner, writing from one of their own phones, may open a direct channel. */
export function isOwnerSender(args: {
  senderPhone: string;
  ownerPhones: Array<string | null | undefined>;
  roles: string[];
}): boolean {
  const sender = phoneTail(args.senderPhone);
  return (
    sender.length === 9 &&
    args.ownerPhones.some((phone) => phoneTail(phone) === sender) &&
    args.roles.some((role) => OWNER_ROLES.has(role))
  );
}

export function whatsAppReplyText(provider: string, content: string): string {
  const label = LABEL[provider as WhatsAppDirectProvider] || provider;
  const body = content.length > 3500 ? `${content.slice(0, 3500)}…` : content;
  return `🤖 ${label}:\n${body}`;
}

/** The WhatsApp chat a direct-channel session should answer, from its metadata. */
export function replyTargetFrom(sessionMetadata: unknown): WhatsAppReplyTarget | null {
  const raw = asRecord(asRecord(sessionMetadata).reply_whatsapp);
  const { integration_id, phone_number, connection_user_id } = raw;
  if (
    typeof integration_id !== "string" ||
    typeof phone_number !== "string" ||
    typeof connection_user_id !== "string" ||
    !integration_id ||
    !phone_number ||
    !connection_user_id
  )
    return null;
  return { integration_id, phone_number, connection_user_id };
}
