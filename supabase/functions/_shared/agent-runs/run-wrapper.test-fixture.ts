/**
 * Runs the real handler of a function that starts agent runs
 * (replay-agent-run, run-agent-eval, run-agent-supervisor, run-ai-agent-v2)
 * against an in-memory Supabase, for the AIO-661 access tests: two tenants,
 * one member each, and the tokens a caller can present.
 */
import { fakeSupabaseHttp } from "../testing/fake-supabase-http.ts";
import { servedHandler, withRuntime } from "../testing/served-handler.ts";

export const SUPABASE_URL = "https://this-project.supabase.co";
export const SERVICE_KEY = "service-role-key-of-this-project";
/** The project's public key: it passes the gateway and names no user. */
export const ANON_KEY = "anon-key-of-this-project";
export const TENANT_A = "11111111-1111-4111-8111-111111111111";
export const TENANT_B = "22222222-2222-4222-8222-222222222222";
export const MEMBER_A = "33333333-3333-4333-8333-333333333333";
export const MEMBER_B = "44444444-4444-4444-8444-444444444444";
/** MEMBER_A's session token. */
export const TOKEN_A = "session-token-of-member-a";

type Row = Record<string, unknown>;

/** One request to the function: the bearer token (null: no header) and the body, sent as is when it is text. */
export type RunCall = { token: string | null; body: unknown };

/** What the function answered and what it asked of Supabase and the model. */
export type RunCallResult = {
  status: number;
  reply: Row;
  /** Tables read over REST, in order. */
  reads: Array<string>;
  /** Bodies of the run-ai-agent-v2 invocations. */
  started: Array<unknown>;
  /** Rows written, as `[method, table, body]`. */
  writes: Array<[string, string, unknown]>;
};

/** The spellings of an id PostgreSQL or supabase-js would read as the id, besides the canonical one. */
export function otherSpellings(id: string): Array<[string, unknown]> {
  return [
    ["in an array", [id]],
    ["without hyphens", id.replaceAll("-", "")],
    ["in braces", `{${id}}`],
  ];
}

/**
 * Sends one request to the handler in `entry` over `tables`; each member
 * belongs to their own tenant. `model` answers the handler's model calls.
 */
export async function callRunFunction(
  entry: URL,
  tables: Record<string, Array<Row>>,
  call: RunCall,
  model: (url: URL, body: unknown) => Response = () => Response.json({}),
): Promise<RunCallResult> {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    tables: {
      tenant_users: [
        { tenant_id: TENANT_A, user_id: MEMBER_A },
        { tenant_id: TENANT_B, user_id: MEMBER_B },
      ],
      ...tables,
    },
    rpc: { is_super_admin: () => false },
    users: { [TOKEN_A]: MEMBER_A },
    other: model,
  });
  const env = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    OPENAI_API_KEY: "model-key",
  };

  const response = await withRuntime({ env, fetch: http.fetch }, async () => {
    const handle = await servedHandler(entry);
    return await handle(runRequest(entry, call));
  });

  const rest = http.calls.filter((c) => c.url.pathname.startsWith("/rest/v1/"));
  return {
    status: response.status,
    reply: await response.json(),
    reads: rest.filter((c) => c.method === "GET").map((c) => table(c.url)),
    started: http.calls
      .filter((c) => c.url.pathname === "/functions/v1/run-ai-agent-v2")
      .map((c) => c.body),
    writes: rest
      .filter((c) => c.method !== "GET" && !table(c.url).startsWith("rpc/"))
      .map((c) => [c.method, table(c.url), c.body]),
  };
}

/** The table or rpc a REST request addresses. */
function table(url: URL): string {
  return url.pathname.replace("/rest/v1/", "");
}

/** The POST a caller sends to the function. */
function runRequest(entry: URL, { token, body }: RunCall): Request {
  const name = entry.pathname.split("/").at(-2);

  return new Request(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
