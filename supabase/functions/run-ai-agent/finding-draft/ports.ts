/**
 * What the confirmation needs from the database, always within the run's
 * tenant; store.ts implements it over the service-role client.
 */
import type {
  ClientCardEntryInput,
  ClientCardEntryResult,
} from "../../_shared/client-card.ts";
import type { Tables } from "../../_shared/database.types.ts";

export type DraftFinding = Pick<
  Tables<"carmen_findings">,
  | "id"
  | "client_id"
  | "agency_id"
  | "kind"
  | "short_code"
  | "owner_user_id"
  | "evidence"
>;

export type FindingDraftPorts = {
  findLive(tenantId: string, shortCode: number): Promise<DraftFinding | null>;
  isAssigned(
    tenantId: string,
    clientId: string,
    campaignerId: string,
    now: Date,
  ): Promise<boolean>;
  writeCard(input: ClientCardEntryInput): Promise<ClientCardEntryResult>;
  resolve(
    tenantId: string,
    findingId: string,
    actorUserId: string,
    note: string,
  ): Promise<boolean>;
};
