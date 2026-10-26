import type { Json } from "../_shared/database.types.ts";
import type { compareReportToMeta } from "../_shared/report-meta-verify.mjs";
import { isObject } from "./json-config.ts";

/** Reads `value.key` the way optional chaining did on parsed provider JSON; non-objects have no fields. */
export function readField(value: unknown, key: string): unknown {
  return isObject(value) ? Reflect.get(value, key) : undefined;
}

/** `payload?.error?.message` for untrusted provider/HTTP JSON bodies. */
export function nestedErrorMessage(payload: unknown): unknown {
  return readField(readField(payload, "error"), "message");
}

/** Google Calendar `events.list` item; leaves stay unknown until read. */
export interface GoogleCalendarEventItem {
  id?: unknown;
  summary?: unknown;
  htmlLink?: unknown;
  start?: unknown;
  end?: unknown;
  attendees?: unknown[] | null;
}

export type ReportMetaCheck = Partial<
  ReturnType<typeof compareReportToMeta>
> & {
  client: string | null;
  agency?: string | null;
  error?: string;
};

export interface AdAccountHealthIssue {
  client_id: string;
  client_name: string;
  agency_name: string | null;
  ad_account_id: Json | undefined;
  fb: {
    status: string;
    has_spend_7d: boolean;
    all_paused: boolean;
    token_ok: boolean;
  };
  flags: string[];
}

export interface ParallelTaskArg {
  title: unknown;
  prompt: unknown;
  task_skills?: unknown;
  side_effects?: unknown;
}

/** LLM-supplied `delegate_parallel` entry with a truthy title and prompt. */
export function isParallelTaskArg(value: unknown): value is ParallelTaskArg {
  return (
    isObject(value) &&
    Boolean(readField(value, "title")) &&
    Boolean(readField(value, "prompt"))
  );
}

export interface AutomationStepArg {
  type: unknown;
  skin: unknown;
  instruction: unknown;
  action_type: unknown;
  config: unknown;
  label: unknown;
}

/** Reads an LLM-supplied automation step; null/undefined entries still fail like a property read did. */
export function automationStepArg(value: unknown): AutomationStepArg {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${value} (reading 'type')`);
  }
  return {
    type: readField(value, "type"),
    skin: readField(value, "skin"),
    instruction: readField(value, "instruction"),
    action_type: readField(value, "action_type"),
    config: readField(value, "config"),
    label: readField(value, "label"),
  };
}
