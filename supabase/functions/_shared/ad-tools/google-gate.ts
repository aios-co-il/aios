/** carmen-google-tools gate (AIO-239): the caller, then for a user the Google
 * Ads customer. */
import {
  adToolAccess,
  type AdToolAuthResult,
  type AdToolGateInput,
  authorizeGateCaller,
} from "./caller.ts";
import { type AdScope, checkGoogleTarget } from "./scope.ts";

/** carmen-google-tools: caller, then (for a user) the Google Ads customer. */
export async function authorizeGoogleToolRequest(
  input: AdToolGateInput,
): Promise<AdToolAuthResult> {
  const access = adToolAccess("carmen-google-tools", input.body.action);
  const auth = await authorizeGateCaller(input, access);
  if (!auth.ok || auth.caller.kind !== "user") {
    return auth;
  }
  const scope: AdScope = { tenantId: auth.caller.tenantId, access };
  const target = await checkGoogleTarget({
    body: input.body,
    scope,
    store: input.store,
  });
  return target.ok ? auth : target;
}
