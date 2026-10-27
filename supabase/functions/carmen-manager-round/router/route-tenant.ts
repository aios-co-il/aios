/**
 * Routes a tenant's due findings: resolves each client's people once, asks
 * the router for a decision per finding, records the decisions, and raises or
 * clears the routing gaps (no_campaigner, missing_phone) it saw or re-checked.
 */
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { FindingCandidate } from "../collectors/types.ts";
import type { FindingsStore } from "../findings/store.ts";
import type { FindingRow, RouteDecision } from "../findings/types.ts";
import type { PeopleDirectory, StaffMember } from "../recipients/directory.ts";
import {
  type ClientRecipients,
  resolveBriefRecipients,
  resolveClientRecipients,
} from "../recipients/resolve.ts";
import { gapClientIds, listOpenGaps, recheckPeople } from "./gap-recheck.ts";
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
  /** Loaded only when there is something to route or re-check. */
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
  const open = await listOpenGaps(deps.findings, input.tenantId);
  if (!findings.length && !open.length) {
    return { findings, decisions: [], gaps: [] };
  }
  const staff = await input.staff();
  const brief = resolveBriefRecipients(staff, input.settings);
  const clientIds = [
    ...findings.map((finding) => finding.client_id ?? ""),
    ...gapClientIds(open),
  ];
  const people = await resolvePeople(deps.directory, input, staff, clientIds);
  const decisions = findings.map((finding) =>
    routeFinding(finding, {
      ...input,
      brief,
      people: people.get(finding.client_id ?? "") ?? NO_PEOPLE,
    }),
  );
  const rechecked = await recheckPeople(
    deps.directory,
    input.tenantId,
    staff,
    open,
  );
  const gaps = routingGaps(
    {
      clients: people,
      people: [...brief, ...rechecked.people],
      gone: rechecked.gone,
    },
    input.now,
  );
  if (!input.dryRun) {
    await deps.findings.applyRoute(input.tenantId, input.roundId, decisions);
    await recordGaps(deps.findings, input, gaps);
  }
  return { findings, decisions, gaps: gaps.candidates };
}

/** Each distinct client's people, resolved once per run ("" for no client). */
async function resolvePeople(
  directory: PeopleDirectory,
  input: RouteTenantInput,
  staff: StaffMember[],
  clientIds: string[],
): Promise<Map<string, ClientRecipients>> {
  const people = new Map<string, ClientRecipients>();
  for (const clientId of new Set(clientIds)) {
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
