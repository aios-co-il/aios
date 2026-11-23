/**
 * Who may approve a drafted client-card entry, shared by Carmen's
 * "אשר <code>" (run-ai-agent/card-draft-approval/) and the card-drafts page
 * (carmen-card-drafts-approve): the finding row an approval reads, and the
 * database's rule for the approving person.
 */
import type { Tables } from "../database.types.ts";
import type { DbClient } from "../supabase-clients.ts";
import { throwIf } from "./db-error.ts";

/** The finding an approval reads: its scope, code and drafted evidence. */
export type DraftFinding = Pick<
  Tables<"carmen_findings">,
  "id" | "client_id" | "agency_id" | "short_code" | "evidence"
>;

/**
 * The person's role for the finding by the findings feed's own rule
 * (carmen_finding_role_of); null when the feed would not show it to them.
 * Asked with the service key for an explicit user, as
 * carmen_finding_resolve_card_written asks it before closing the finding, so
 * an approval it would refuse is refused before anything is written.
 */
export async function findingRoleOf(
  db: DbClient,
  tenantId: string,
  finding: Pick<DraftFinding, "client_id" | "agency_id">,
  userId: string,
): Promise<string | null> {
  const { data, error } = await db.rpc("carmen_finding_role_of", {
    p_user_id: userId,
    p_tenant_id: tenantId,
    p_client_id: finding.client_id ?? undefined,
    p_agency_id: finding.agency_id ?? undefined,
  });
  throwIf(error, "carmen_finding_role_of");
  return data ?? null;
}
