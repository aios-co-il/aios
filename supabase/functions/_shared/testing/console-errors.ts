/**
 * Runs `fn` with console.error recorded instead of printed, so a test can
 * assert what a handler logged for a failure it hides from the caller.
 */
export function withConsoleErrors<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; logged: string }> {
  return withConsoleLines("error", fn);
}

/** Runs `fn` with one console method recorded instead of printed. */
export async function withConsoleLines<T>(
  method: "error" | "warn" | "log",
  fn: () => Promise<T>,
): Promise<{ result: T; logged: string }> {
  const lines: Array<string> = [];
  const original = console[method];
  console[method] = (...args: Array<unknown>) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const result = await fn();
    return { result, logged: lines.join("\n") };
  } finally {
    console[method] = original;
  }
}
