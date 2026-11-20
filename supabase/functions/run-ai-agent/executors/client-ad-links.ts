import type { AgentDatabaseClient } from "../database-contracts.ts";
import {
  AccessDeniedError,
  assertCallerCanAccessClient,
  type CallerScope,
} from "../../_shared/auth-helpers.ts";
import {
  googleCustomerVariants,
  metaAccountVariants,
} from "../../_shared/ad-tools/ids.ts";
import { createAdScopeStore } from "../../_shared/ad-tools/store.ts";

// Agent tools that take a Meta campaign id or a Google Ads customer id check it
// against the client links carmen-fb-tools and carmen-google-tools use
// (_shared/ad-tools/store.ts): clients.*_ads_account_id or a report table.

/** Whether the Meta ad account is linked to the client. */
export async function metaAccountLinksToClient(
  supabase: AgentDatabaseClient,
  accountId: unknown,
  clientId: string,
): Promise<boolean> {
  const variants = metaAccountVariants(accountId);
  if (!variants) {
    return false;
  }
  const clientIds =
    await createAdScopeStore(supabase).clientIdsForMetaAccount(variants);
  // A uuid may arrive in upper case; Postgres returns ids in lower case.
  return clientIds.some((id) => id.toLowerCase() === clientId.toLowerCase());
}

/**
 * Throws AccessDeniedError unless the caller may read the Google Ads customer:
 * through a linked client that assertCallerCanAccessClient allows. Callers that
 * helper lets through without a client check (managers, and in-app callers
 * with no campaigner identity) keep reading any customer of their tenant.
 */
export async function assertCallerCanAccessGoogleCustomer(
  supabase: AgentDatabaseClient,
  customerId: string,
  scope: CallerScope,
): Promise<void> {
  if (
    scope.isManagerRole ||
    (!scope.isTeamManager && !scope.callerCampaignerId)
  ) {
    return;
  }
  const variants = googleCustomerVariants(customerId);
  if (!variants) {
    throw new AccessDeniedError("customer_id לא תקין");
  }
  const clientIds =
    await createAdScopeStore(supabase).clientIdsForGoogleCustomer(variants);
  for (const clientId of new Set(clientIds)) {
    try {
      await assertCallerCanAccessClient(supabase, clientId, scope);
      return;
    } catch (error) {
      if (!(error instanceof AccessDeniedError)) {
        throw error;
      }
    }
  }
  throw new AccessDeniedError(
    "חשבון Google Ads זה לא משויך ללקוח שיש לך גישה אליו",
  );
}
