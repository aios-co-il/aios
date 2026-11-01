/** carmen-fb-tools gate (AIO-239): the caller, then for a user the client_id
 * and the Meta object the action changes. */
import {
  adToolAccess,
  type AdToolAuthResult,
  type AdToolCaller,
  type AdToolGateInput,
  authorizeGateCaller,
} from "./caller.ts";
import {
  type AdScope,
  checkClientTarget,
  checkFbEntityTarget,
} from "./scope.ts";

/** Whose Meta token a call runs with; see fbTokenSource. */
export type FbTokenSource = { tenantId: string; clientId: string | null };

/** carmen-fb-tools: caller, then (for a user) client_id and the Meta object. */
export async function authorizeFbToolRequest(
  input: AdToolGateInput & {
    /** Ad account of a Meta campaign / ad set / ad, read with that token;
     * null when the token cannot read it. */
    fetchAccountId(
      token: FbTokenSource,
      entityId: string,
    ): Promise<string | null>;
  },
): Promise<AdToolAuthResult> {
  const action = String(input.body.action ?? "");
  const access = adToolAccess("carmen-fb-tools", action);
  const auth = await authorizeGateCaller(input, access);
  if (!auth.ok || auth.caller.kind !== "user") {
    return auth;
  }
  const caller = auth.caller;
  const scope: AdScope = { tenantId: caller.tenantId, access };
  const client = await checkClientTarget(
    input.store,
    scope,
    input.body.client_id,
  );
  if (!client.ok) {
    return client;
  }
  const entity = await checkFbEntityTarget({
    action,
    body: input.body,
    scope,
    store: input.store,
    fetchAccountId: (id) =>
      input.fetchAccountId(fbTokenSource(caller, input.body.client_id), id),
  });
  return entity.ok ? auth : entity;
}

/**
 * Whose Meta token a carmen-fb-tools call runs with: `clientId` set means the
 * token of the tenant that owns that client, else the tenant's own token.
 *
 * A user acts only with their own tenant's token, so Meta's grants on it bound
 * what they can reach. The client-owning tenant's token would let a share
 * holder act on that tenant's other ad accounts, linked through rows the user
 * can write themselves (clients.meta_ads_account_id, crm_tables). The service
 * role keeps the client-owning tenant's token for shared clients (approval
 * execute, the shutdown runner).
 */
export function fbTokenSource(
  caller: AdToolCaller,
  bodyClientId: unknown,
): FbTokenSource {
  if (caller.kind === "user") {
    return { tenantId: caller.tenantId, clientId: null };
  }
  return {
    tenantId: caller.tenantId,
    clientId: bodyClientId ? String(bodyClientId) : null,
  };
}
