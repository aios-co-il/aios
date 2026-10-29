import { asUuidOrNull } from "../../_shared/uuid.ts";

/** Distinct UUIDs among `values`, lowercased; anything else is dropped. */
export function uuids(values: unknown[]): string[] {
  return [
    ...new Set(
      values
        .map(asUuidOrNull)
        .filter((s): s is string => s !== null)
        .map((s) => s.toLowerCase()),
    ),
  ];
}

/**
 * Last 9 digits of a phone or WhatsApp chat id; "" when too short. Not
 * phoneMatchKey: that one also keys 7–8-digit numbers, which would widen the
 * own-chat sender_phone match.
 */
export function phoneTail(value: unknown): string {
  const digits = String(value || "")
    .split("@")[0]
    .replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}
