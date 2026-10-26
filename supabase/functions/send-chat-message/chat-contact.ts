import { unknownField } from "../_shared/json-fields.ts";

export interface ChatContact {
  id: string;
  name: string | null;
  manychat_subscriber_id: string | null;
  tenant_id: string;
}

const isNullableString = (value: unknown) =>
  value === null || value === undefined || typeof value === "string";

/** A clients/leads row carrying the fields send-chat-message reads. */
export function isChatContact(value: unknown): value is ChatContact {
  return (
    typeof unknownField(value, "id") === "string" &&
    typeof unknownField(value, "tenant_id") === "string" &&
    isNullableString(unknownField(value, "name")) &&
    isNullableString(unknownField(value, "manychat_subscriber_id"))
  );
}
