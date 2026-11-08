import {
  isGroupChatId,
  normalizeNotifyPhone,
} from "../carmen-notify-target.ts";
import { z } from "npm:zod@3.25.76";
import type { Json } from "../database.types.ts";

const optionalString = z.string().optional().catch(undefined);
const settingsSchema = z
  .object({
    api_key: optionalString,
    webhook_id: optionalString,
    webhook_url: optionalString,
    instance_id: optionalString,
    webhook_secret: optionalString,
    country_code: optionalString,
    status: optionalString,
    phone_number: optionalString,
  })
  .catch({});
export type ManusSettings = z.infer<typeof settingsSchema>;

/** Validate the Manus integration fields before exposing them to callers. */
export function readManusSettings(value: unknown): ManusSettings {
  return settingsSchema.parse(value);
}

/** Preserve unrelated storage fields when updating Manus integration settings. */
export function mergeManusSettings(
  value: Json | undefined,
  patch: ManusSettings,
): Json {
  const stored =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, field]) => field !== undefined),
  );
  return { ...stored, ...definedPatch };
}

/** Keep raw gateway data opaque until its specific response schema is applied. */
export function parseJsonOrRaw(text: string): Json {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const gatewaySchema = z
  .object({
    success: z.boolean().optional().catch(undefined),
    error: optionalString,
    messageId: optionalString,
    status: optionalString,
    phoneNumber: optionalString,
  })
  .catch({});
/** Fields consumed from a Manus WhatsApp gateway response. */
export function readGatewayResponse(value: unknown) {
  return gatewaySchema.parse(value);
}

const taskSchema = z
  .object({
    task_id: optionalString,
    id: optionalString,
    task_url: optionalString,
    share_url: optionalString,
  })
  .catch({});
const taskResponseSchema = taskSchema
  .removeCatch()
  .extend({ data: taskSchema.optional() })
  .catch({});
/** Validate both v2 task response envelope variants. */
export function readTaskResponse(value: unknown) {
  return taskResponseSchema.parse(value);
}

const toolArgsSchema = z
  .object({
    request: optionalString,
    context: optionalString,
    agent_profile: optionalString,
    task: optionalString,
    branch: optionalString,
  })
  .catch({});
export type ManusToolArgs = z.infer<typeof toolArgsSchema>;
const rpcSchema = z
  .object({
    id: z.union([z.string(), z.number(), z.null()]).optional().catch(undefined),
    method: optionalString,
    params: z
      .object({ name: optionalString, arguments: toolArgsSchema.optional() })
      .optional()
      .catch(undefined),
  })
  .catch({});
/** Read the supported MCP envelope and tool arguments without arbitrary keys. */
export function readManusRpc(value: unknown) {
  return rpcSchema.parse(value);
}

const notifySchema = z.object({
  tenant_id: z.string().trim(),
  message: z.string().trim(),
  chat_id: z
    .string()
    .trim()
    .refine(
      (chatId) =>
        !isGroupChatId(chatId) && normalizeNotifyPhone(chatId) !== null,
      { message: "chat_id must identify a private phone" },
    )
    .optional(),
});
/** Invalid notification requests must fail before recipient lookup. */
export function readNotifyRequest(value: unknown) {
  return notifySchema.safeParse(value);
}
const notifyStepSchema = z
  .object({
    green_api_integration_id: optionalString,
    integration_id: optionalString,
  })
  .catch({});
/** Read sender identifiers from an automation's notification action. */
export function readNotifyStep(value: unknown) {
  return notifyStepSchema.parse(value);
}
const errorSchema = z
  .object({ message: optionalString, name: optionalString })
  .catch({});
/** Read a string message from an error-like value. */
export function thrownMessage(value: unknown): string | undefined {
  return errorSchema.parse(value).message;
}
/** Read a string name from an error-like value. */
export function thrownName(value: unknown): string | undefined {
  return errorSchema.parse(value).name;
}
