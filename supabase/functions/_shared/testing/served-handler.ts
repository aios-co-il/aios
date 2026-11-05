/**
 * Runs an edge function's real entry point in a Deno test: its index.ts is
 * imported with Deno.serve captured instead of listening, and withRuntime
 * stands in for the runtime's environment and network while it runs.
 */

type ServeHandler = (
  req: Request,
  info: unknown,
) => Response | Promise<Response>;

let loads = 0;

/** The handler the entry module passes to Deno.serve, from a fresh import of it. */
export async function servedHandler(
  entry: URL,
): Promise<(req: Request) => Promise<Response>> {
  let served: unknown = null;
  const serve = Deno.serve;
  Reflect.set(Deno, "serve", (handler: unknown) => {
    served = handler;
    return {};
  });
  try {
    loads += 1;
    // A new query string makes a new module instance, so Deno.serve runs again.
    await import(`${entry.href}?served=${loads}`);
  } finally {
    Reflect.set(Deno, "serve", serve);
  }
  if (!isServeHandler(served)) {
    throw new Error(`${entry.pathname} passed no handler to Deno.serve`);
  }
  const handler = served;
  return async (req) => await handler(req, {});
}

/**
 * Runs `fn` with these env vars set (null: unset) and `fetch` replaced, and
 * restores both afterwards. Module-level env reads happen at import, so
 * import inside `fn`.
 */
export async function withRuntime<T>(
  runtime: { env: Record<string, string | null>; fetch: typeof fetch },
  fn: () => Promise<T>,
): Promise<T> {
  const saved: [string, string | undefined][] = Object.keys(runtime.env).map(
    (key) => [key, Deno.env.get(key)],
  );
  const realFetch = globalThis.fetch;
  for (const [key, value] of Object.entries(runtime.env)) {
    setEnv(key, value);
  }
  globalThis.fetch = runtime.fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
    for (const [key, value] of saved) {
      setEnv(key, value ?? null);
    }
  }
}

/** Sets or, for null, deletes one env var. */
function setEnv(key: string, value: string | null): void {
  if (value === null) {
    Deno.env.delete(key);
  } else {
    Deno.env.set(key, value);
  }
}

/** Whether Deno.serve was given a plain handler function. */
function isServeHandler(value: unknown): value is ServeHandler {
  return typeof value === "function";
}
