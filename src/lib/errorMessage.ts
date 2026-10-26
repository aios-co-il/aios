/** Reads a thrown value's `message` without assuming an Error instance. */
export function readErrorMessage(error: unknown): string | undefined {
  if (error === null || typeof error !== "object" || !("message" in error)) {
    return undefined;
  }
  const { message } = error;
  if (message === undefined || message === null) return undefined;
  return typeof message === "string" ? message : String(message);
}
