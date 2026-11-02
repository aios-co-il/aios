/** A real typed client whose requests are recorded and answered locally. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../../_shared/database.types.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";

export type Call = {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
};

/**
 * `respond` returns the JSON body (sent with `status`); a HEAD count request
 * gets `count` in Content-Range.
 */
export function recordingClient(
  respond: (call: Call) => unknown = () => [],
  options: { count?: number; status?: number } = {},
): { db: DbClient; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const call: Call = {
      method: init?.method ?? "GET",
      path: url.pathname.replace("/rest/v1/", ""),
      query: url.searchParams,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    if (call.method === "HEAD") {
      const headers = { "Content-Range": `*/${options.count ?? 0}` };
      return Promise.resolve(new Response(null, { status: 200, headers }));
    }
    const headers = { "Content-Type": "application/json" };
    return Promise.resolve(
      new Response(JSON.stringify(respond(call)), {
        status: options.status ?? 200,
        headers,
      }),
    );
  };
  return {
    db: createClient<Database>("http://localhost:54321", "test-key", {
      global: { fetch: fetchImpl },
    }),
    calls,
  };
}
