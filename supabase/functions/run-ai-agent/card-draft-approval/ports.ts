/**
 * What an approval needs from the database, always within the run's tenant;
 * store.ts implements it over the service-role client.
 */
import type { CardDraftWritePorts } from "../../_shared/manager-round/card-draft-write.ts";
import type { Tables } from "../../_shared/database.types.ts";

export type DraftFinding = Pick<
  Tables<"carmen_findings">,
  "id" | "client_id" | "agency_id" | "short_code" | "evidence"
>;

export type ApprovalPorts = {
  /** The live finding with this code in the tenant, or null. */
  findLive(tenantId: string, shortCode: number): Promise<DraftFinding | null>;
  /**
   * The person's role for the finding by the findings feed's own rule
   * (carmen_finding_role_of); null when the feed would not show it to them.
   */
  roleOf(
    tenantId: string,
    finding: Pick<DraftFinding, "client_id" | "agency_id">,
    userId: string,
  ): Promise<string | null>;
  write: CardDraftWritePorts;
};
