/** Raises a database error with the step it came from; nothing is swallowed. */
export function throwIf(error: { message: string } | null, step: string): void {
  if (error) {
    throw new Error(`${step}: ${error.message}`);
  }
}
