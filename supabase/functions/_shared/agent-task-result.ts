// Readers for the agent_tasks.result jsonb checkpoint (written by run-agent-task,
// spawnSubagent and run-ai-agent's task creation).
import type { Json } from "./database.types.ts";
import type { SpawnSubagentParams } from "./subagent.ts";

export type JsonObject = { [key: string]: Json | undefined };
export type WhatsAppNotify = NonNullable<SpawnSubagentParams["notify"]>;

export function isJsonObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value itself when it is a JSON object, otherwise an empty object. */
export function asJsonObject(value: Json | undefined): JsonObject {
  return isJsonObject(value) ? value : {};
}

/** Last non-blank assistant message in a stored conversation_history. */
export function lastAssistantContent(
  history: Json | undefined,
): string | undefined {
  if (!Array.isArray(history)) return undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (
      isJsonObject(message) &&
      message.role === "assistant" &&
      typeof message.content === "string" &&
      message.content.trim().length > 0
    ) {
      return message.content;
    }
  }
  return undefined;
}

/** final_output when present, else the last assistant message of the history. */
export function taskResultOutput(result: JsonObject): string | undefined {
  if (typeof result.final_output === "string") return result.final_output;
  return lastAssistantContent(result.conversation_history);
}

function isNullableString(value: Json | undefined): value is string | null {
  return value === null || typeof value === "string";
}

/** A complete WhatsApp notify target as spawnSubagent / run-ai-agent store it; anything else is null. */
export function readWhatsAppNotify(
  value: Json | undefined,
): WhatsAppNotify | null {
  if (!isJsonObject(value)) return null;
  const {
    surface,
    tenant_id,
    automation_id = null,
    connection_user_id,
    chat_id,
    phone_number = null,
    is_group,
  } = value;
  if (
    surface !== "whatsapp" ||
    typeof tenant_id !== "string" ||
    !isNullableString(automation_id) ||
    typeof connection_user_id !== "string" ||
    typeof chat_id !== "string" ||
    !isNullableString(phone_number) ||
    typeof is_group !== "boolean"
  ) {
    return null;
  }
  return {
    surface,
    tenant_id,
    automation_id,
    connection_user_id,
    chat_id,
    phone_number,
    is_group,
  };
}
