// Runs a Deno.serve edge function in a test. The module's Deno.serve call is
// caught instead of serving, and fetch is answered by a fake Supabase REST
// API and a fake provider, so a test sees whether a send reached the
// provider. For the senders whose handler is one index.ts.

type Handler = (request: Request) => Response | Promise<Response>;

export const SERVICE_ROLE_KEY = "service-role-key";

const SUPABASE_URL = "http://supabase.test";

const TEST_ENV: Record<string, string> = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  APP_ENV: "production",
};

export type BackendCall = { method: string; path: string; body: unknown };

/** The handler the module passes to Deno.serve; nothing listens. */
export async function loadServedHandler(moduleUrl: URL): Promise<Handler> {
  const serve = Object.getOwnPropertyDescriptor(Deno, "serve");
  const caught: { handler?: Handler } = {};
  Object.defineProperty(Deno, "serve", {
    configurable: true,
    value: (...args: unknown[]) => {
      caught.handler = args.find(isHandler);
      return { finished: Promise.resolve() };
    },
  });
  try {
    await import(moduleUrl.href);
  } finally {
    if (serve) {
      Object.defineProperty(Deno, "serve", serve);
    }
  }
  if (!caught.handler) {
    throw new Error(`${moduleUrl.pathname} did not call Deno.serve`);
  }
  return caught.handler;
}

/**
 * Calls the handler with the test env. `routes` answers Supabase REST calls
 * by "METHOD /path" (for example "POST /rpc/is_super_admin"); a missing
 * route answers [] to a read and 201 to a write. Any other URL is the
 * provider: recorded and answered with `providerReply`.
 */
export async function callServedHandler(
  handler: Handler,
  request: Request,
  routes: Record<string, unknown>,
  providerReply: unknown,
) {
  const rest: BackendCall[] = [];
  const provider: BackendCall[] = [];
  const realFetch = globalThis.fetch;
  const restoreEnv = setEnv(TEST_ENV);
  globalThis.fetch = async (input, init) => {
    const call = new Request(input, init);
    const url = new URL(call.url);
    const record = {
      method: call.method,
      path: url.origin === SUPABASE_URL ? url.pathname : url.href,
      body: await readBody(call),
    };
    if (url.origin !== SUPABASE_URL) {
      provider.push(record);
      return jsonResponse(providerReply);
    }
    record.path = url.pathname.replace(/^\/rest\/v1/, "");
    rest.push(record);
    return restAnswer(call, routes[`${call.method} ${record.path}`]);
  };
  try {
    const response = await handler(request);
    return { response, rest, provider };
  } finally {
    globalThis.fetch = realFetch;
    restoreEnv();
  }
}

/** PostgREST's answer: one object when the client asked for one. */
function restAnswer(call: Request, answer: unknown): Response {
  if (answer === undefined) {
    return call.method === "GET"
      ? jsonResponse([])
      : new Response(null, { status: 201 });
  }
  const wantsObject = (call.headers.get("Accept") ?? "").includes(
    "vnd.pgrst.object",
  );
  return jsonResponse(
    wantsObject && Array.isArray(answer) ? (answer[0] ?? null) : answer,
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

/** The body as JSON when it is JSON, else its text. */
async function readBody(call: Request): Promise<unknown> {
  const text = await call.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

/** Sets the variables and returns how to put the old values back. */
function setEnv(values: Record<string, string>): () => void {
  const previous = Object.keys(values).map(
    (key) => [key, Deno.env.get(key)] as const,
  );
  for (const [key, value] of Object.entries(values)) {
    Deno.env.set(key, value);
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    }
  };
}

function isHandler(value: unknown): value is Handler {
  return typeof value === "function";
}
