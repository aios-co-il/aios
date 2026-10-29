/**
 * Runs `fn` with console.error recorded instead of printed, so a test can
 * assert what a handler logged for a failure it hides from the caller.
 */
export async function withConsoleErrors<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; logged: string }> {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const result = await fn();
    return { result, logged: lines.join("\n") };
  } finally {
    console.error = original;
  }
}
