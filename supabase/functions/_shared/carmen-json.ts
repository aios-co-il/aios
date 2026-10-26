// Readers for Carmen's JSON columns (automation configuration and session
// conversation_history), which are untyped `Json` in the generated schema.
import type { Json } from "./database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

/** Carmen automation configuration (trigger step merged over automation). */
export type CarmenAutomationConfig = JsonObject & {
  carmen_lid_aliases?: { [lid: string]: string };
};

/** A JSON value read as an object; null, arrays and scalars read as empty. */
export function asJsonObject(value: Json | undefined): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

export function jsonString(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function aliasPhone(phone: Json | undefined): string | null {
  if (typeof phone === "string") return phone;
  if (typeof phone === "number" && Number.isFinite(phone)) return String(phone);
  return null;
}

/** Keeps string and finite-number LID alias entries (numbers as strings). */
export function toCarmenAutomationConfig(
  config: JsonObject,
): CarmenAutomationConfig {
  const { carmen_lid_aliases: rawAliases, ...rest } = config;
  if (rawAliases === undefined) return rest;
  const aliases: { [lid: string]: string } = {};
  for (const [lid, value] of Object.entries(asJsonObject(rawAliases))) {
    const phone = aliasPhone(value);
    if (phone !== null) aliases[lid] = phone;
  }
  return { ...rest, carmen_lid_aliases: aliases };
}

/** The trigger step's configuration merged over the automation's own. */
export function mergeCarmenStepConfig(
  automationConfig: Json | undefined,
  stepConfig: JsonObject,
): CarmenAutomationConfig {
  return toCarmenAutomationConfig({
    ...asJsonObject(automationConfig),
    ...stepConfig,
  });
}

/** A field of a JSON value; null, arrays and scalars have no fields. */
export function jsonField(
  value: Json | undefined,
  key: string,
): Json | undefined {
  return asJsonObject(value)[key];
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export function isChatTurn(turn: Json): turn is ChatTurn {
  const role = jsonField(turn, "role");
  return (
    (role === "user" || role === "assistant") &&
    typeof jsonField(turn, "content") === "string"
  );
}
