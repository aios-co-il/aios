/**
 * The findings of the client threads: unanswered requests past the SLA,
 * complaints at any age, and the waits staff answered. A finding already
 * closed for the same message is never raised again.
 */
import type { FindingKind } from "../../../_shared/manager-round/kinds.ts";
import type {
  CollectorContext,
  FindingCandidate,
  FindingResolution,
} from "../types.ts";
import type { ActivityQuery } from "./activity.ts";
import { answeredWaits } from "./answered.ts";
import {
  type ChatLink,
  requestCandidates,
  withVerdicts,
} from "./candidates.ts";
import { classifyThreads } from "./classify.ts";
import { complaintCandidates } from "./complaints.ts";
import { gateThreads } from "./gate.ts";
import type { ChatSources } from "./sources.ts";
import { buildThreads, type Thread } from "./threads.ts";

export type ThreadFindings = {
  candidates: FindingCandidate[];
  resolved: FindingResolution[];
  llm: { calls: number; costUsd: number };
  /** False when the read stopped at its page cap. */
  complete: boolean;
};

/** Reads and reviews the threads for the enabled thread kinds. */
export async function threadFindings(
  ctx: CollectorContext,
  src: ChatSources,
  query: ActivityQuery,
  kinds: readonly FindingKind[],
): Promise<ThreadFindings> {
  const requests = kinds.includes("unanswered_request");
  const complaints = kinds.includes("client_complaint");
  const { threads, complete } = await readThreads(src, query);
  const [live, closed, linkBase] = await Promise.all([
    src.live(),
    src.closed(query.since),
    src.chatLinkBase(),
  ]);
  const chatLink: ChatLink = (id) => (linkBase ? `${linkBase}${id}` : null);
  const waits = gateThreads(threads, live, ctx.settings, ctx.now);
  const due = new Set(waits.map((wait) => wait.thread.key));
  // Without complaints, only the waits past the SLA need the model.
  const reviewed = complaints ? threads : threads.filter((t) => due.has(t.key));
  const { verdicts, llm } = await classifyThreads(
    reviewed,
    { dueKeys: due, complaints },
    src.classify,
    ctx,
  );
  const found = [
    ...(requests
      ? requestCandidates(withVerdicts(waits, verdicts), chatLink)
      : []),
    ...(complaints
      ? complaintCandidates(threads, verdicts, live, {
          since: query.since,
          clientIds: ctx.clientIds,
          chatLink,
        })
      : []),
  ];
  const candidates = found.filter(
    (c) => !closed.has(`${c.kind}|${c.fingerprint}`),
  );
  const resolved = requests
    ? answeredWaits(threads, live, candidates, ctx.settings)
    : [];
  return { candidates, resolved, llm, complete };
}

/** Threads with their clients' calls and the staff roster of every tenant involved. */
async function readThreads(
  src: ChatSources,
  query: ActivityQuery,
): Promise<{ threads: Thread[]; complete: boolean }> {
  const { rows, complete } = await src.activity(query);
  const clientIds = [...new Set(rows.map((row) => row.client_id))];
  const clientTenants = rows.flatMap((row) => row.client_tenant_id ?? []);
  const tenantIds = [...new Set([query.tenantId, ...clientTenants])];
  const [staffKeys, calls] = await Promise.all([
    src.staffKeys(tenantIds, query.since),
    src.calls(tenantIds, clientIds, query.since),
  ]);
  return { threads: buildThreads(rows, staffKeys, calls), complete };
}
