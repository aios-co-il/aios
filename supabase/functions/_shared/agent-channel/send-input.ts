import type { InputMode } from "./types.ts";
import { isRecord } from "../unknown-record.ts";

export type HistoryMessage = { role: string; content: string };

const INPUT_MODES: ReadonlySet<string> = new Set<InputMode>([
  "typed",
  "realtime_voice",
  "transcribe_only",
  "external_channel_callback",
]);

function isInputMode(value: unknown): value is InputMode {
  return typeof value === "string" && INPUT_MODES.has(value);
}

export function parseInputMode(raw: unknown): InputMode {
  return isInputMode(raw) ? raw : "typed";
}

function isHistoryMessage(value: unknown): value is HistoryMessage {
  return (
    isRecord(value) &&
    typeof value.role === "string" &&
    typeof value.content === "string"
  );
}

export function parseConversationHistory(raw: unknown): HistoryMessage[] {
  return Array.isArray(raw) ? raw.filter(isHistoryMessage) : [];
}
