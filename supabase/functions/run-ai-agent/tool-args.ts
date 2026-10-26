import type { JsonRecord } from "./run-request.ts";

/**
 * Readers for LLM tool-call arguments (already JSON-parsed). Well-formed input reads
 * exactly as before; values of the wrong JSON type read as absent unless noted.
 */

/** String argument. Numbers are accepted as their text form, as filters and templates rendered them. */
export function argString(args: JsonRecord, key: string): string | undefined {
  const value = args[key];
  if (typeof value === "string") return value;
  return typeof value === "number" ? String(value) : undefined;
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
  return args[key] === null ? null : argString(args, key);
}

/** Numeric argument; numeric strings (LLMs often quote numbers) convert like `Number(x)`. */
export function argNumber(args: JsonRecord, key: string): number | undefined {
  const value = args[key];
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Partial-update value: `null` clears the column; otherwise as `argNumber`. */
export function argNullableNumber(
  args: JsonRecord,
  key: string,
): number | null | undefined {
  return args[key] === null ? null : argNumber(args, key);
}

/** Array of strings; non-string entries are dropped. */
export function argStringArray(
  args: JsonRecord,
  key: string,
): string[] | undefined {
  const value = args[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

/** Plain JSON object argument (not an array). */
export function argObject(
  args: JsonRecord,
  key: string,
): JsonRecord | undefined {
  const value = args[key];
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
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
  const match = allowed.find((option) => option === value);
  if (match === undefined) {
    throw new Error(`${key} must be one of: ${allowed.join(", ")}`);
  }
  return match;
}

/** Boolean argument; LLMs often quote booleans, so "true"/"false" count too. Other present values throw. */
export function argBoolean(args: JsonRecord, key: string): boolean | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "false") return value === "true";
  throw new Error(`${key} must be boolean`);
}
