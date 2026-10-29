import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

export type JsonObject = { [key: string]: Json | undefined };
export type StepConfigValue = Json | undefined;
export type StepConfig = JsonObject;
export type StepConfigChange = (key: string, value: StepConfigValue) => void;
export type StepConfigBulkChange = (updates: StepConfig) => void;

export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(
  z.custom<Json | undefined>(),
);

const numberSchema = z.union([z.number(), z.nan()]);

export const textSchema = z.union([
  z.string(),
  numberSchema.transform(String),
  z.boolean().transform(String),
]);

export const optionalStringSchema = z.string().optional().catch(undefined);
export const optionalTextSchema = textSchema.optional().catch(undefined);

const numericSchema = z.union([
  numberSchema,
  z
    .string()
    .refine((value) => value.trim() !== "")
    .transform(Number)
    .refine(Number.isFinite),
]);

const jsonTextSchema = z.string().transform((text, ctx): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid JSON" });
    return z.NEVER;
  }
});

export const jsonObjectTextSchema = jsonTextSchema.pipe(jsonObjectSchema);

const errorLikeSchema = z.object({ message: z.string() });

function parsed<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function listOf<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T[] | undefined {
  return parsed(z.array(z.unknown()), value)?.flatMap((item) => {
    const result = schema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}

export function isJsonObject(value: unknown): value is JsonObject {
  return jsonObjectSchema.safeParse(value).success;
}

export function parseStepConfig(config: unknown): StepConfig {
  if (isJsonObject(config)) return config;
  return parsed(jsonObjectTextSchema, config) ?? {};
}

export function cfgString(value: unknown): string | undefined {
  return parsed(z.string(), value);
}

export function cfgText(value: unknown): string | undefined {
  return parsed(textSchema, value);
}

export function cfgNumber(value: unknown): number | undefined {
  return parsed(numberSchema, value);
}

export function cfgNumeric(value: unknown): number | undefined {
  return parsed(numericSchema, value);
}

export function cfgBool(value: unknown): boolean | undefined {
  return parsed(z.boolean(), value);
}

export function cfgStringArray(value: unknown): string[] | undefined {
  return listOf(z.string(), value);
}

export function cfgObject(value: unknown): JsonObject | undefined {
  return isJsonObject(value) ? value : undefined;
}

export function cfgObjectArray(value: unknown): JsonObject[] | undefined {
  return parsed(z.array(z.unknown()), value)?.filter(isJsonObject);
}

export function errorMessage(error: unknown): string | undefined {
  return parsed(errorLikeSchema, error)?.message;
}

export function cfgTextArray(value: unknown): string[] | undefined {
  return listOf(textSchema, value);
}
