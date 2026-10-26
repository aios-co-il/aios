import type { Json } from "@/integrations/supabase/types";

export type JsonObject = { [key: string]: Json | undefined };
export type StepConfigValue = Json | undefined;
export type StepConfig = JsonObject;
export type StepConfigChange = (key: string, value: StepConfigValue) => void;
export type StepConfigBulkChange = (updates: StepConfig) => void;

export function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseStepConfig(config: unknown): StepConfig {
  if (isJsonObject(config)) return config;
  if (typeof config === "string") {
    try {
      const parsed: unknown = JSON.parse(config);
      if (isJsonObject(parsed)) return parsed;
    } catch {
      // ignore malformed JSON from legacy/AI-created steps
    }
  }
  return {};
}

export function cfgString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function cfgText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

export function cfgNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function cfgBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function cfgStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

export function cfgObject(value: unknown): JsonObject | undefined {
  return isJsonObject(value) ? value : undefined;
}

export function cfgObjectArray(value: unknown): JsonObject[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isJsonObject);
}

export function errorMessage(error: unknown): string | undefined {
  if (error && typeof error === "object" && "message" in error) {
    return typeof error.message === "string" ? error.message : undefined;
  }
  return undefined;
}

export function cfgTextArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    const text = cfgText(item);
    return text === undefined ? [] : [text];
  });
}
