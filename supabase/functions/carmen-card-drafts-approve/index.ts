/**
 * carmen-card-drafts-approve: a signed-in person approves client-card drafts
 * (card_stale_group findings) from the card-drafts page. See handler.ts.
 */
import { cardDraftWritePorts } from "../_shared/manager-round/card-draft-write.ts";
import { throwIf } from "../_shared/manager-round/db-error.ts";
import { FINDING_LIVE_STATUSES } from "../_shared/manager-round/kinds.ts";
import { serviceClient, userClient } from "../_shared/supabase-clients.ts";
import { type ApproveDeps, handleApprove } from "./handler.ts";

Deno.serve((req) => handleApprove(req, liveDeps()));

/** The signed-in user, the drafts read as that user, and the writes over the service key. */
function liveDeps(): ApproveDeps {
  return {
    async userId(authorization) {
      const { data, error } = await userClient(authorization).auth.getUser();
      if (error) {
        console.warn("[carmen-card-drafts-approve] auth failed", error.message);
      }
      return data.user?.id ?? null;
    },
    async visibleDrafts(authorization, request) {
      const { data, error } = await userClient(authorization)
        .from("carmen_findings")
        .select("id, client_id, short_code, evidence")
        .eq("tenant_id", request.tenantId)
        .eq("kind", "card_stale_group")
        .in("status", [...FINDING_LIVE_STATUSES])
        .in("id", request.findingIds);
      throwIf(error, "carmen_findings");
      return data ?? [];
    },
    write: cardDraftWritePorts(serviceClient()),
  };
}
