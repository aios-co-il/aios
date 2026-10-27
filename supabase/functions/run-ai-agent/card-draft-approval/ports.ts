/**
 * What an approval needs from the database, always within the run's tenant;
 * store.ts implements it over the service-role client.
 */
import type { CardDraftWritePorts } from "../../_shared/manager-round/card-draft-write.ts";
import type { Tables } from "../../_shared/database.types.ts";
import type { Approver } from "./authorize.ts";

export type DraftFinding = Pick<
  Tables<"carmen_findings">,
  "id" | "client_id" | "agency_id" | "short_code" | "owner_user_id" | "evidence"
>;

export type ApprovalPorts = {
  /** The live finding with this code in the tenant, or null. */
  findLive(tenantId: string, shortCode: number): Promise<DraftFinding | null>;
  /** The person's roles in the tenant, managed agencies and campaigner. */
  approver(tenantId: string, userId: string): Promise<Approver>;
  /** True when the campaigner is assigned to the client today. */
  isAssigned(
    tenantId: string,
    clientId: string,
    campaignerId: string,
    now: Date,
  ): Promise<boolean>;
  write: CardDraftWritePorts;
};
