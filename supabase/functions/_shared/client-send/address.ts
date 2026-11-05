// The shape of a provider address decides how resolve_send_recipient matches
// it. A WhatsApp chat id carries its shape in its suffix, unless the send
// names the group row it read the chat id from.
import { phoneMatchKey } from "../telephony/phone.ts";
import type { ClientSendRequest } from "./types.ts";

export type AddressShape =
  | { shape: "phone" | "group" | "email" | "telegram"; address: string }
  | { shape: "unusable" };

const UNUSABLE: AddressShape = { shape: "unusable" };

/** Suffixes of a one-to-one WhatsApp chat id; the rest is the phone. */
const WHATSAPP_PHONE_SUFFIXES = ["@c.us", "@s.whatsapp.net"];

/**
 * How the resolver reads an address. A send that names its group row goes
 * to a group, whatever the stored chat id's suffix. `unusable` when nothing
 * can match it, such as a `@lid` chat id or a phone too short for
 * phone_match_key.
 */
export function addressShape(
  input: Pick<ClientSendRequest, "channel" | "address" | "groupId">,
): AddressShape {
  const value = input.address.trim();
  if (input.channel === "email") {
    return emailShape(value);
  }
  if (input.channel === "telegram") {
    return /^-?\d{1,18}$/.test(value)
      ? { shape: "telegram", address: value }
      : UNUSABLE;
  }
  return whatsappShape(value, input.groupId !== null);
}

/** A group chat id as is, or the phone of a one-to-one chat id. */
function whatsappShape(value: string, namedGroup: boolean): AddressShape {
  if (value && (namedGroup || value.endsWith("@g.us"))) {
    return { shape: "group", address: value };
  }
  const suffix = WHATSAPP_PHONE_SUFFIXES.find((end) => value.endsWith(end));
  const phone = suffix ? value.slice(0, -suffix.length) : value;
  if (phone.includes("@") || !phoneMatchKey(phone)) {
    return UNUSABLE;
  }
  return { shape: "phone", address: phone };
}

/** The address lower-cased, as resolve_send_recipient compares emails. */
function emailShape(value: string): AddressShape {
  const email = value.toLowerCase();
  return /^[^@\s]+@[^@\s]+$/.test(email)
    ? { shape: "email", address: email }
    : UNUSABLE;
}
