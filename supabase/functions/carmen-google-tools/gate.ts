/** The AIO-239 caller and target gate for carmen-google-tools. */
import type { AdToolAuthResult } from "../_shared/ad-tools/caller.ts";
import { authorizeGoogleToolRequest } from "../_shared/ad-tools/google-gate.ts";
import {
  createAdScopeStore,
  createAdToolIdentity,
  type StoreDb,
} from "../_shared/ad-tools/store.ts";

/** May this caller run this call? A refusal is logged without the token or
 * body. */
export async function authorizeGoogleCall(
  req: Request,
  body: Record<string, unknown>,
  deps: { db: StoreDb; serviceRoleKey: string },
): Promise<AdToolAuthResult> {
  const gate = await authorizeGoogleToolRequest({
    authorization: req.headers.get("Authorization"),
    serviceRoleKey: deps.serviceRoleKey,
    body,
    identity: createAdToolIdentity(deps.db),
    store: createAdScopeStore(deps.db),
  });
  if (!gate.ok) {
    console.warn("[carmen-google-tools] refused", gate.status, gate.error);
  }
  return gate;
}
