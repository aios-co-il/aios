/**
 * R5 contact accountability (AIO-253, plan C19): who spoke with a client and
 * did not log it (contact_not_logged) and which clients nobody contacted
 * (no_contact). Deterministic, hourly, one service-role read per tenant
 * (get_client_contact_evidence); fixtures.contact replaces that read in a
 * dry run outside Production.
 */
import type { Collector, CollectorContext, CollectorResult } from "../types.ts";
import {
  type ContactEvidence,
  fixtureEvidence,
  loadContactEvidence,
} from "./evidence.ts";
import { noContactFindings } from "./no-contact.ts";
import { notLoggedFindings } from "./not-logged.ts";
import { type ContactRules, loadContactRules } from "./rules.ts";

const DAY_MS = 86_400_000;

export const contactCollector: Collector = {
  id: "contact",
  kinds: ["contact_not_logged", "no_contact"],
  detectorVersion: "1",
  schedule: { cron: "5 * * * *" },
  // The evidence is read whole every run, so one miss means it was fixed.
  clearAfterMisses: 1,
  collect: collectContact,
};

/** Rules, evidence, then both rules over every client in scope. */
async function collectContact(ctx: CollectorContext): Promise<CollectorResult> {
  const rules = await loadContactRules(ctx.db, ctx.tenantId);
  const evidence = await contactEvidence(ctx, rules);
  return {
    candidates: [
      ...notLoggedFindings(evidence, rules, ctx.now),
      ...noContactFindings(evidence, rules, ctx.now),
    ],
    watermark: null,
    coverage: { complete: true, clientIds: ctx.clientIds },
  };
}

/** The no_contact window of evidence, from fixtures when the request has them. */
function contactEvidence(
  ctx: CollectorContext,
  rules: ContactRules,
): Promise<ContactEvidence[]> {
  const fixtures = fixtureEvidence(ctx.fixtures);
  if (fixtures) {
    return Promise.resolve(fixtures);
  }
  return loadContactEvidence(ctx.db, {
    tenantId: ctx.tenantId,
    since: new Date(ctx.now.getTime() - rules.noContactDays * DAY_MS),
    minCallSeconds: rules.minCallSeconds,
    clientIds: ctx.clientIds,
  });
}
