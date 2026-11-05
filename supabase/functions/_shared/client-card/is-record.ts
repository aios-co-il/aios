/** Whether a value is a non-null object whose keys can be read and spread. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
