// JSON responses for the telephony edge functions.
import { corsHeaders } from "../cors.ts";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const preflight = () => new Response(null, { headers: corsHeaders });

/** Logs the real error and returns a generic 500, so database text never
 *  reaches a public caller. */
export function internalError(scope: string, error: unknown): Response {
  console.error(`${scope} error:`, error);
  return json({ error: "Internal error" }, 500);
}
