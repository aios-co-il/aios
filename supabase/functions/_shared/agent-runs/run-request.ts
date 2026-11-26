/**
 * Opens a request to a function that starts agent runs for its caller and
 * passes them to run-ai-agent-v2 with the service key: replay-agent-run,
 * run-agent-eval and run-agent-supervisor (AIO-661). run-ai-agent-v2 trusts
 * what they send, so the caller is settled here.
 *
 * Nothing of the request is read for a caller that is not verified. A
 * signed-in user runs only as themselves, in a tenant they belong to
 * (runTenantDenied, the rule run-ai-agent applies). The function then reads
 * its source row inside the tenant this returns.
 */
import type { DbClient } from "../supabase-clients.ts";
import { bodyUuid } from "./body-id.ts";
import { type RunAuth, runTenantDenied } from "./run-tenant-access.ts";

/** The refusal the handler sends back. */
export type RunRequestRefusal = {
  ok: false;
  status: 400 | 401 | 403;
  error: string;
};

/** A request whose caller may run in `tenantId` as `userId`. */
export type OpenedRunRequest = {
  ok: true;
  body: Record<string, unknown>;
  tenantId: string;
  /** The row the run starts from: the body's `source.field`. */
  sourceId: string;
  /** The session user; for a service caller, the user it names or null. */
  userId: string | null;
};

/** The body field naming the row a run starts from, and whether that row is the agent to run. */
export type RunSource = { field: string; isAgent?: boolean };

/**
 * Verifies the caller, then reads the body and checks its tenant and source
 * id for that caller. `authenticate` is `requireAuth` (_shared/security.ts).
 */
export async function openRunRequest(
  req: Request,
  sb: Pick<DbClient, "from" | "rpc">,
  authenticate: (req: Request) => Promise<RunAuth | null>,
  source: RunSource,
): Promise<OpenedRunRequest | RunRequestRefusal> {
  const auth = await authenticate(req);
  if (!auth) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const body = await jsonObject(req);
  const tenantId = bodyUuid(body?.tenant_id);
  const sourceId = bodyUuid(body?.[source.field]);
  if (!body || !tenantId || !sourceId) {
    console.warn(
      `[agent-runs] refused ${auth.kind} ${auth.userId ?? ""}: ${source.field} and tenant_id must be uuid strings`,
    );
    return {
      ok: false,
      status: 400,
      error: `missing or invalid ${source.field}/tenant_id`,
    };
  }

  const denied = await runTenantDenied(sb, auth, {
    tenant_id: tenantId,
    agent_id: source.isAgent ? sourceId : null,
  });
  if (denied) {
    return { ok: false, status: 403, error: denied };
  }

  const userId = auth.kind === "user" ? auth.userId : bodyUuid(body.user_id);
  return { ok: true, body, tenantId, sourceId, userId };
}

/** The request's JSON object; null when the body is anything else. */
async function jsonObject(
  req: Request,
): Promise<Record<string, unknown> | null> {
  // A body that is not JSON is refused and logged by the caller, as no object.
  const parsed: unknown = await req.json().catch(() => null);

  return isRecord(parsed) ? parsed : null;
}

/** Whether a parsed body is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
