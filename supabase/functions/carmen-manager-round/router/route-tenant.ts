/**
 * Routes a tenant's due findings: resolves each client's people once, asks
 * the router for a decision per finding, records the decisions, and raises or
 * clears the routing gaps it saw (no_campaigner, missing_phone).
 */
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { FindingCandidate } from "../collectors/types.ts";
import type { FindingsStore } from "../findings/store.ts";
import type {
  FindingRow,
  Recipient,
  RouteDecision,
} from "../findings/types.ts";
import type { PeopleDirectory, StaffMember } from "../recipients/directory.ts";
import {
  type ClientRecipients,
  resolveBriefRecipients,
  resolveClientRecipients,
} from "../recipients/resolve.ts";
import { recordGaps, routingGaps } from "./gaps.ts";
import { type NotifyFloors, routeFinding } from "./route.ts";

/** Findings routed per tenant per call; the rest wait for the next round. */
export const ROUTE_LIMIT = 200;

export type RouteTenantInput = {
  tenantId: string;
  roundId: string;
  settings: ManagerSettings;
  now: Date;
  today: string;
  floors: NotifyFloors;
  /** Loaded only when there is something to route. */
  staff: () => Promise<StaffMember[]>;
  dryRun: boolean;
  /** Dry-run only: candidates shown as if they were new findings. */
  virtual?: FindingRow[];
};

export type RouteTenantResult = {
  findings: FindingRow[];
  decisions: RouteDecision[];
  gaps: FindingCandidate[];
};

/** Routes the tenant's due findings and records decisions and gaps (not in a dry run). */
export async function routeTenant(
  deps: { findings: FindingsStore; directory: PeopleDirectory },
  input: RouteTenantInput,
): Promise<RouteTenantResult> {
  const stored = await deps.findings.listRoutable(
    input.tenantId,
    input.now,
    ROUTE_LIMIT,
  );
  const findings = [...stored, ...(input.virtual ?? [])];
  if (!findings.length) {
    return { findings, decisions: [], gaps: [] };
  }
  const staff = await input.staff();
  const brief = resolveBriefRecipients(staff, input.settings);
  const people = await resolvePeople(deps.directory, input, staff, findings);
  const decisions = findings.map((finding) =>
    routeFinding(finding, {
      ...input,
      brief,
      people: people.get(finding.client_id ?? "") ?? NO_PEOPLE,
    }),
  );
  const gaps = routingGaps([...people.values()], brief, input.now);
  if (!input.dryRun) {
    await deps.findings.applyRoute(input.tenantId, input.roundId, decisions);
    await recordGaps(deps.findings, input, gaps);
  }
  return { findings, decisions, gaps: gaps.candidates };
}

/** Each distinct client's people, resolved once per run. */
async function resolvePeople(
  directory: PeopleDirectory,
  input: RouteTenantInput,
  staff: StaffMember[],
  findings: FindingRow[],
) {
  const people = new Map<string, ClientRecipients>();
  for (const clientId of new Set(
    findings.map((finding) => finding.client_id ?? ""),
  )) {
    people.set(
      clientId,
      await resolveClientRecipients(directory, {
        tenantId: input.tenantId,
        clientId: clientId || null,
        today: input.today,
        staff,
      }),
    );
  }
  return people;
}

const NO_PEOPLE: ClientRecipients = {
  client: null,
  campaigners: [],
  managers: [],
};
