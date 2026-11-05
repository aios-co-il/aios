/** carmen-google-tools gate (AIO-239): the caller, then for a user or an
 * approved action (AIO-307) the Google Ads customer. */
import {
  adToolAccess,
  type AdToolAuthResult,
  type AdToolGateInput,
  authorizeGateCaller,
  checksTargets,
} from "./caller.ts";
import { type AdScope, checkGoogleTarget } from "./scope.ts";

/** carmen-google-tools: caller, then (user or approved action) the Google Ads customer. */
export async function authorizeGoogleToolRequest(
  input: AdToolGateInput,
): Promise<AdToolAuthResult> {
  const access = adToolAccess("carmen-google-tools", input.body.action);
  const auth = await authorizeGateCaller(input, access);
  if (!auth.ok || !checksTargets(auth.caller)) {
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
