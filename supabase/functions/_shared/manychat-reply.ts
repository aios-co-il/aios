import { z } from "npm:zod@3.25.76";

const successStatusSchema = z.object({ status: z.literal("success") });

const successReplySchema = z.object({
  status: z.literal("success"),
  data: z.object({ id: z.unknown() }),
});

const messageReplySchema = z.object({ message: z.string() });

const customFieldsReplySchema = z.object({
  status: z.literal("success"),
  data: z.array(z.unknown()),
});

const customFieldSchema = z
  .object({ id: z.unknown(), name: z.unknown() })
  .passthrough();

const cachedFieldIdSchema = z
  .union([z.number(), z.string().transform(Number)])
  .pipe(z.number().finite())
  .nullable()
  .catch(null);

/** True when the ManyChat reply has `status: "success"`. */
export function isManyChatSuccess(reply: unknown): boolean {
  return successStatusSchema.safeParse(reply).success;
}

/** ManyChat reply `data.id` when the call succeeded, otherwise undefined. */
export function manyChatSuccessId(reply: unknown): unknown {
  return successReplySchema.safeParse(reply).data?.data.id || undefined;
}

/** True when the reply's `message` mentions ManyChat's rate limit. */
export function mentionsManyChatRateLimit(reply: unknown): boolean {
  const message = messageReplySchema.safeParse(reply).data?.message;
  return message?.includes("max rps") ?? false;
}

/** The custom field named phone_number in a getCustomFields reply. */
export function findManyChatPhoneField(
  reply: unknown,
  fieldName = "phone_number",
): { id?: unknown } | null {
  const body = customFieldsReplySchema.safeParse(reply);
  if (!body.success) return null;
  for (const item of body.data.data) {
    const field = customFieldSchema.safeParse(item);
    if (!field.success) continue;
    const { name } = field.data;
    if (
      name === fieldName ||
      (typeof name === "string" && name.toLowerCase() === "phone_number")
    ) {
      return field.data;
    }
  }
  return null;
}

/** A cached custom field id as a number; null when unset or not numeric, so it is fetched again. */
export function cachedManyChatFieldId(value: unknown): number | null {
  return value ? cachedFieldIdSchema.parse(value) : null;
}
