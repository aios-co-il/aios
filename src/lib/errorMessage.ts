/** The string `message` of a thrown value (Error, PostgREST error, ...), if it has one. */
export function errorMessageOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return undefined;
  }
  const { message } = error;
  return typeof message === "string" ? message : undefined;
}
