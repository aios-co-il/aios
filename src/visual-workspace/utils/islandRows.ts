import type { AgentRole } from "../types/visualWorkspaceTypes";

const AGENT_ROLES: readonly AgentRole[] = [
  "ceo",
  "marketing",
  "sales",
  "creative",
  "finance",
  "dev",
  "customer_success",
  "system",
];

export function toAgentRole(role: unknown): AgentRole {
  return AGENT_ROLES.find((known) => known === role) ?? "ceo";
}

export interface IslandItem {
  id: string;
  name?: string | null;
  title?: string | null;
  content?: string | null;
  supplier_name?: string | null;
  integration_name?: string | null;
  status?: string | null;
  active?: boolean | null;
}

export interface IslandAgent {
  id: string;
  name?: string | null;
  role?: string | null;
  model?: string | null;
  active?: boolean | null;
}

export interface RecentMessage {
  id: string;
  direction?: string | null;
  message?: string | null;
  created_at?: string | null;
  sender_name?: string | null;
}

export type IdRows = readonly { id: string }[] | null;

type FieldValue<T> = T | null | undefined;

function readField<K extends string>(row: object, key: K): unknown {
  return key in row ? (row as { [P in K]: unknown })[key] : undefined;
}

function textField(row: object, key: string): FieldValue<string> {
  const value = readField(row, key);
  if (value === undefined || value === null) return value;
  return typeof value === "string" ? value : String(value);
}

function boolField(row: object, key: string): FieldValue<boolean> {
  const value = readField(row, key);
  if (value === undefined || value === null) return value;
  return typeof value === "boolean" ? value : Boolean(value);
}

function rowsWithId(rows: unknown): (object & { id: string })[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: unknown) =>
    typeof row === "object" &&
    row !== null &&
    "id" in row &&
    typeof row.id === "string"
      ? [{ ...row, id: row.id }]
      : [],
  );
}

export function readIslandItems(rows: unknown): IslandItem[] {
  return rowsWithId(rows).map((row) => ({
    id: row.id,
    name: textField(row, "name"),
    title: textField(row, "title"),
    content: textField(row, "content"),
    supplier_name: textField(row, "supplier_name"),
    integration_name: textField(row, "integration_name"),
    status: textField(row, "status"),
    active: boolField(row, "active"),
  }));
}

export function readIslandAgents(rows: unknown): IslandAgent[] {
  return rowsWithId(rows).map((row) => ({
    id: row.id,
    name: textField(row, "name"),
    role: textField(row, "role"),
    model: textField(row, "model"),
    active: boolField(row, "active"),
  }));
}

export function readRecentMessages(rows: unknown): RecentMessage[] {
  return rowsWithId(rows).map((row) => ({
    id: row.id,
    direction: textField(row, "direction"),
    message: textField(row, "message"),
    created_at: textField(row, "created_at"),
    sender_name: textField(row, "sender_name"),
  }));
}
