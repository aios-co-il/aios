/**
 * Narrowing for JSON values the reconciliation reads: jsonb columns, request
 * bodies and platform responses (AIO-238).
 */

/** True for any non-null object, arrays included. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** `value` when it is an object, else an empty one. */
export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
