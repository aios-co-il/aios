import type { SpawnSubagentParams } from "../_shared/subagent.ts";
import { isObject } from "./json-config.ts";

/** Originating WhatsApp chat, forwarded to reminders and subagents. */
export type WaNotifyTarget = NonNullable<SpawnSubagentParams["notify"]>;

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** Accepts the full target that buildWaNotifyFromOrigin / CarmenWaNotify send; anything else is dropped. */
export function readWaNotifyTarget(
  value: unknown,
): WaNotifyTarget | null | undefined {
  if (value === undefined || value === null) return value;
  if (!isObject(value)) return null;
  const target = {
    surface: "surface" in value ? value.surface : undefined,
    tenant_id: "tenant_id" in value ? value.tenant_id : undefined,
    automation_id: "automation_id" in value ? value.automation_id : null,
    connection_user_id:
      "connection_user_id" in value ? value.connection_user_id : undefined,
    chat_id: "chat_id" in value ? value.chat_id : undefined,
    phone_number: "phone_number" in value ? value.phone_number : null,
    is_group: "is_group" in value ? value.is_group : undefined,
  };
  if (
    target.surface !== "whatsapp" ||
    typeof target.tenant_id !== "string" ||
    !nullableString(target.automation_id) ||
    typeof target.connection_user_id !== "string" ||
    typeof target.chat_id !== "string" ||
    !nullableString(target.phone_number) ||
    typeof target.is_group !== "boolean"
  ) {
    return null;
  }
  return {
    ...value,
    surface: target.surface,
    tenant_id: target.tenant_id,
    automation_id: target.automation_id,
    connection_user_id: target.connection_user_id,
    chat_id: target.chat_id,
    phone_number: target.phone_number,
    is_group: target.is_group,
  };
}

/** Chat the request came from; null only when the request carried no wa_notify object. */
export interface WaChatScope {
  chat_id: string | null;
  is_group: boolean | null;
}

/** Keeps the chat scope even when the delivery target is incomplete, so history search never widens. */
export function readWaChatScope(value: unknown): WaChatScope | null {
  if (!isObject(value)) return null;
  const chatId = "chat_id" in value ? value.chat_id : undefined;
  const isGroup = "is_group" in value ? value.is_group : undefined;
  return {
    chat_id:
      (typeof chatId === "string" && chatId !== "") ||
      (typeof chatId === "number" && Number.isFinite(chatId) && chatId !== 0)
        ? String(chatId)
        : null,
    is_group: typeof isGroup === "boolean" ? isGroup : null,
  };
}
