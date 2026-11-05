import { corsHeaders } from "../cors.ts";
import { MemberAdminError, type MemberAdminStore } from "./member-admin.ts";

/** One member-admin action: the checked flow behind delete-user or set-user-active. */
export type MemberAction = (
  store: MemberAdminStore,
  authorization: string | null,
  body: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/**
 * The request handler for a member-admin edge function: CORS, the JSON body,
 * and every failure as `{ success: false, error }` with its status, logged.
 */
export function memberAdminHandler(
  name: string,
  store: () => MemberAdminStore,
  action: MemberAction,
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      const body = await jsonBody(req);
      const result = await action(
        store(),
        req.headers.get("authorization"),
        body,
      );
      return reply(200, { success: true, ...result });
    } catch (error) {
      const status = error instanceof MemberAdminError ? error.status : 500;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${name}] ${status}: ${message}`);
      return reply(status, { success: false, error: message });
    }
  };
}

/** The request's JSON object, or a 400. */
async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const body: unknown = await req.json().catch(() => null);
  if (!isJsonObject(body)) {
    throw new MemberAdminError(400, "The body must be a JSON object");
  }
  return body;
}

/** A plain JSON object (not null, not an array). */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A JSON response with CORS headers. */
function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
