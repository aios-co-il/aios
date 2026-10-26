/** The `message` of a thrown value (Error or error-like object such as a PostgREST error). */
export function thrownMessage(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "message" in e) {
    const { message } = e;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
}
