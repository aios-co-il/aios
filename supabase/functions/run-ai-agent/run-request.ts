import type { Json } from "../_shared/database.types.ts";
import { isObject, jsonObject } from "./json-config.ts";
import type { WaNotifyTarget } from "./tool-contracts-crm.ts";
import { readWaNotifyTarget } from "./wa-notify.ts";

export type JsonRecord = { [key: string]: Json | undefined };

/** Fields of `direct_tool` (carmen-tools-mcp); each is narrowed where it is used. */
export interface DirectToolRequest {
  action?: Json;
  caller?: Json;
  approval_id?: Json;
  approved_by?: Json;
  name?: Json;
  args?: Json;
}

/**
 * The run-ai-agent request body. Values of the wrong JSON type are treated as
 * absent, the same way the brain guard reads `tenant_id` / `agent_id`.
 */
export interface RunAgentRequest {
  agent_id?: string;
  command_text?: string;
  temperature?: number;
  automation_id?: string;
  user_name?: string;
  lead_data?: JsonRecord;
  tenant_id?: string;
  user_id?: string | null;
  task_skills?: string[];
  task_mode?: string;
  conversation_history?: Json[];
  conversation_id?: string;
  wa_notify?: WaNotifyTarget | null;
  model_override?: string;
  pin_skills_only?: boolean;
  active_skin?: Json;
  carmen_automation?: JsonRecord;
  system_prompt_addon?: string;
  context_metadata?: JsonRecord;
  stream?: boolean;
  surface?: string;
  brain_slug?: Json;
  direct_tool?: DirectToolRequest;
}

function stringField(value: Json | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function recordField(value: Json | undefined): JsonRecord | undefined {
  return isObject(value) ? jsonObject(value) : undefined;
}

function directToolField(
  value: Json | undefined,
): DirectToolRequest | undefined {
  if (!value) return undefined;
  const raw = jsonObject(value);
  return {
    action: raw.action,
    caller: raw.caller,
    approval_id: raw.approval_id,
    approved_by: raw.approved_by,
    name: raw.name,
    args: raw.args,
  };
}

export function parseRunAgentRequest(value: Json): RunAgentRequest {
  const body = jsonObject(value);
  const taskSkills = body.task_skills;
  return {
    agent_id: stringField(body.agent_id),
    command_text: stringField(body.command_text),
    temperature:
      typeof body.temperature === "number" ? body.temperature : undefined,
    automation_id: stringField(body.automation_id),
    user_name: stringField(body.user_name),
    lead_data: recordField(body.lead_data),
    tenant_id: stringField(body.tenant_id),
    user_id: stringField(body.user_id),
    task_skills: Array.isArray(taskSkills)
      ? taskSkills.filter((s): s is string => typeof s === "string")
      : undefined,
    task_mode: stringField(body.task_mode),
    conversation_history: Array.isArray(body.conversation_history)
      ? body.conversation_history
      : undefined,
    conversation_id: stringField(body.conversation_id),
    wa_notify: readWaNotifyTarget(body.wa_notify),
    model_override: stringField(body.model_override),
    pin_skills_only:
      typeof body.pin_skills_only === "boolean"
        ? body.pin_skills_only
        : undefined,
    active_skin: body.active_skin,
    carmen_automation: recordField(body.carmen_automation),
    system_prompt_addon: stringField(body.system_prompt_addon),
    context_metadata: recordField(body.context_metadata),
    stream: typeof body.stream === "boolean" ? body.stream : undefined,
    surface: stringField(body.surface),
    brain_slug: body.brain_slug,
    direct_tool: directToolField(body.direct_tool),
  };
}

/** `name` of a row whose select type is unresolved (bad column, ambiguous embed). */
export function embeddedName(value: unknown): string | undefined {
  return isObject(value) && "name" in value && typeof value.name === "string"
    ? value.name
    : undefined;
}

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

/** User/assistant turns of a stored or client-sent history; other entries are dropped. */
export function readConversationTurns(
  value: Json | undefined,
): ConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ConversationTurn[] => {
    const turn = jsonObject(entry);
    return turn.role === "user" || turn.role === "assistant"
      ? [{ role: turn.role, content: String(turn.content || "") }]
      : [];
  });
}
