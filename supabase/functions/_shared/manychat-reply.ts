import { asObject } from "./lead-json.ts";

/** ManyChat reply `data.id` when the call succeeded, otherwise undefined. */
export function manyChatSuccessId(reply: unknown): unknown {
  const body = asObject(reply);
  if (body?.status !== "success") return undefined;
  return asObject(body.data)?.id || undefined;
}

/** True when the reply's `message` mentions ManyChat's rate limit. */
export function mentionsManyChatRateLimit(reply: unknown): boolean {
  const message = asObject(reply)?.message;
  return typeof message === "string" && message.includes("max rps");
}

/** The custom field named phone_number in a getCustomFields reply. */
export function findManyChatPhoneField(
  reply: unknown,
  fieldName = "phone_number",
): { id?: unknown } | null {
  const body = asObject(reply);
  if (body?.status !== "success" || !Array.isArray(body.data)) return null;
  for (const item of body.data) {
    const field = asObject(item);
    const name = field?.name;
    if (
      name === fieldName ||
      (typeof name === "string" && name.toLowerCase() === "phone_number")
    ) {
      return field;
    }
  }
  return null;
}

/** A cached custom field id as a number; null when unset or not numeric, so it is fetched again. */
export function cachedManyChatFieldId(value: unknown): number | null {
  if (!value) return null;
  const id =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isFinite(id) ? id : null;
}
