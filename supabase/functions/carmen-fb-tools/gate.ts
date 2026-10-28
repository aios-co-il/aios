/** The AIO-239 caller and target gate, wired to this function's Meta token
 * lookup and Graph reads. */
import type { AdToolAuthResult } from "../_shared/ad-tools/caller.ts";
import {
  authorizeFbToolRequest,
  type FbTokenSource,
} from "../_shared/ad-tools/fb-gate.ts";
import {
  createAdScopeStore,
  createAdToolIdentity,
  type StoreDb,
} from "../_shared/ad-tools/store.ts";

type GraphAnswer = {
  account_id?: unknown;
  error?: { code?: unknown; message?: unknown };
};

type FbGateDeps = {
  /** Service-role client the caller and scope lookups read with. */
  db: StoreDb;
  serviceRoleKey: string;
  resolveFbToken(
    tenantId: string,
    clientId: string | null,
  ): Promise<string | null>;
  fbGet(path: string, fields: string, token: string): Promise<GraphAnswer>;
};

/** May this caller run this call? A refusal is logged without the token or
 * body. */
export async function authorizeFbCall(
  req: Request,
  body: Record<string, unknown>,
  deps: FbGateDeps,
): Promise<AdToolAuthResult> {
  const gate = await authorizeFbToolRequest({
    authorization: req.headers.get("Authorization"),
    serviceRoleKey: deps.serviceRoleKey,
    body,
    identity: createAdToolIdentity(deps.db),
    store: createAdScopeStore(deps.db),
    fetchAccountId: (src, entityId) => fetchAccountId(deps, src, entityId),
  });
  if (!gate.ok) {
    console.warn("[carmen-fb-tools] refused", gate.status, gate.error);
  }
  return gate;
}

/** The Meta object's ad account, read with the token `src` names; null when
 * there is no token or it cannot read the object (the Graph error is logged,
 * so an expired token or a rate limit leaves a trace). */
async function fetchAccountId(
  deps: FbGateDeps,
  src: FbTokenSource,
  entityId: string,
): Promise<string | null> {
  const token = await deps.resolveFbToken(src.tenantId, src.clientId);
  const obj = token ? await deps.fbGet(entityId, "account_id", token) : null;
  if (obj?.error) {
    console.warn(
      "[carmen-fb-tools] account_id lookup failed",
      obj.error.code,
      obj.error.message,
    );
  }
  return obj?.account_id ? String(obj.account_id) : null;
}
