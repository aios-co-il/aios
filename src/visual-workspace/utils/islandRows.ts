import { z } from "zod";
import { parseEach } from "@/lib/jsonReaders";
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

/** Absent stays undefined, null stays null, anything else becomes text. */
const textField = z
  .unknown()
  .transform((value): string | null | undefined =>
    value === undefined || value === null || typeof value === "string"
      ? value
      : String(value),
  );

const boolField = z
  .unknown()
  .transform((value): boolean | null | undefined =>
    value === undefined || value === null || typeof value === "boolean"
      ? value
      : Boolean(value),
  );

const islandItemSchema = z.object({
  id: z.string(),
  name: textField,
  title: textField,
  content: textField,
  supplier_name: textField,
  integration_name: textField,
  status: textField,
  active: boolField,
});

const islandAgentSchema = z.object({
  id: z.string(),
  name: textField,
  role: textField,
  model: textField,
  active: boolField,
});

const recentMessageSchema = z.object({
  id: z.string(),
  direction: textField,
  message: textField,
  created_at: textField,
  sender_name: textField,
});

export type IslandItem = z.infer<typeof islandItemSchema>;
export type IslandAgent = z.infer<typeof islandAgentSchema>;
export type RecentMessage = z.infer<typeof recentMessageSchema>;

export type IdRows = readonly { id: string }[] | null;

export const readIslandItems = (rows: unknown) =>
  parseEach(islandItemSchema, rows);
export const readIslandAgents = (rows: unknown) =>
  parseEach(islandAgentSchema, rows);
export const readRecentMessages = (rows: unknown) =>
  parseEach(recentMessageSchema, rows);
