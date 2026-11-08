import { z } from "npm:zod@3.25.76";
import { jsonSchema, type JsonRecord } from "./run-request.ts";

/**
 * Readers for LLM tool-call arguments (already JSON-parsed). Well-formed input reads
 * exactly as before; values of the wrong JSON type read as absent unless noted.
 */

/** Numbers are accepted as their text form, as filters and templates rendered them. */
const textArg = z.union([z.string(), z.number().transform(String)]);
const optionalTextArg = textArg.optional().catch(undefined);
const nullableTextArg = z
  .union([z.null(), textArg])
  .optional()
  .catch(undefined);

/** LLMs often quote numbers; numeric strings convert like `Number(x)`. */
const numericText = z
  .string()
  .refine((value) => value.trim() !== "")
  .transform(Number)
  .pipe(z.number().finite());
const numberArg = z.union([z.number(), numericText]);
const optionalNumberArg = numberArg.optional().catch(undefined);
const nullableNumberArg = z
  .union([z.null(), numberArg])
  .optional()
  .catch(undefined);

const stringArrayArg = z
  .array(z.unknown())
  .transform((items) =>
    items.filter((item): item is string => typeof item === "string"),
  )
  .optional()
  .catch(undefined);

const objectArg = z.record(jsonSchema).optional().catch(undefined);

/** LLMs often quote booleans, so "true"/"false" count too. */
const booleanArg = z
  .union([
    z.boolean(),
    z.enum(["true", "false"]).transform((value) => value === "true"),
  ])
  .optional();

/** String argument; numbers read as their text form. */
export function argString(args: JsonRecord, key: string): string | undefined {
  return optionalTextArg.parse(args[key]);
}

/** String argument the tool cannot run without; missing values fail before any request. */
export function requireArgString(args: JsonRecord, key: string): string {
  const value = argString(args, key);
  if (value === undefined) throw new Error(`${key} is required`);
  return value;
}

/** Partial-update value: `null` clears the column; otherwise as `argString`. */
export function argNullableString(
  args: JsonRecord,
  key: string,
): string | null | undefined {
  return nullableTextArg.parse(args[key]);
}

/** Numeric argument; numeric strings convert like `Number(x)`. */
export function argNumber(args: JsonRecord, key: string): number | undefined {
  return optionalNumberArg.parse(args[key]);
}

/** Partial-update value: `null` clears the column; otherwise as `argNumber`. */
export function argNullableNumber(
  args: JsonRecord,
  key: string,
): number | null | undefined {
  return nullableNumberArg.parse(args[key]);
}

/** Array of strings; non-string entries are dropped. */
export function argStringArray(
  args: JsonRecord,
  key: string,
): string[] | undefined {
  return stringArrayArg.parse(args[key]);
}

/** Plain JSON object argument (not an array). */
export function argObject(
  args: JsonRecord,
  key: string,
): JsonRecord | undefined {
  return objectArg.parse(args[key]);
}

/**
 * Enum-like string argument. Falsy values read as absent; any other value outside
 * `allowed` throws, as the database rejected it before.
 */
export function argEnum<Value extends string>(
  args: JsonRecord,
  key: string,
  allowed: readonly Value[],
): Value | undefined {
  const value = args[key];
  if (!value) return undefined;
  const parsed = z
    .string()
    .refine((text): text is Value => allowed.some((option) => option === text))
    .safeParse(value);
  if (!parsed.success) {
    throw new Error(`${key} must be one of: ${allowed.join(", ")}`);
  }
  return parsed.data;
}

/** Boolean argument; any other present value throws. */
export function argBoolean(args: JsonRecord, key: string): boolean | undefined {
  const parsed = booleanArg.safeParse(args[key]);
  if (!parsed.success) throw new Error(`${key} must be boolean`);
  return parsed.data;
}
