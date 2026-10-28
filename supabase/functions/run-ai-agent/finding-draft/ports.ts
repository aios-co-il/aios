/**
 * What the confirmation needs from the database, always within the run's
 * tenant; store.ts implements it over the service-role client.
 */
import type { Tables } from "../../_shared/database.types.ts";
import type { ContactDraftType } from "../../_shared/manager-round/contact-draft.ts";

export type DraftFinding = Pick<
  Tables<"carmen_findings">,
  "id" | "kind" | "short_code" | "evidence"
>;

export type ConfirmRequest = {
  tenantId: string;
  findingId: string;
  /** The person talking to Carmen; the entry is theirs and counts as their contact. */
  userId: string;
  updateType: ContactDraftType;
  content: string;
};

/**
 * carmen_finding_confirm_contact's answer: logged, or not_found (no such
 * live finding, or this person may not log it), or read_only (an agency
 * shared without write access to the card).
 */
export type ConfirmOutcome =
  | { outcome: "logged"; entryId: string; inserted: boolean }
  | { outcome: "not_found" }
  | { outcome: "read_only" };

export type FindingDraftPorts = {
  findLive(tenantId: string, shortCode: number): Promise<DraftFinding | null>;
  confirm(request: ConfirmRequest): Promise<ConfirmOutcome>;
};
