/**
 * Drafts still waiting for approval. The collector reports each again while
 * it is still useful, so the round keeps it open; a draft is dropped (and
 * auto-cleared) once a person updated the card after its first message, or
 * once its last message is older than the lookback.
 */
import type { Json } from "../../../_shared/database.types.ts";
import {
  FINDING_LIVE_STATUSES,
  isFindingSeverity,
} from "../../../_shared/manager-round/kinds.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";
import type { FindingCandidate } from "../types.ts";
import { type CardEntry, humanUpdateAfter } from "./card-entries.ts";
import { LOOKBACK_DAYS } from "./watermark.ts";

const DAY_MS = 86_400_000;

export type LiveDraft = {
  candidate: FindingCandidate;
  /** evidence.window.from: the window's first counted message. */
  from: string;
  /** evidence.window.to: its last message. */
  to: string;
};

/** The collector's live card_stale_group findings for the tenant. */
export async function loadLiveDrafts(
  db: DbClient,
  query: { tenantId: string; collectorId: string; clientIds: string[] | null },
): Promise<LiveDraft[]> {
  const live = db
    .from("carmen_findings")
    .select(
      "kind, fingerprint, severity, client_id, agency_id, source_event_at, summary_he, evidence, owner_user_id",
    )
    .eq("tenant_id", query.tenantId)
    .eq("kind", "card_stale_group")
    .eq("collector", query.collectorId)
    .in("status", [...FINDING_LIVE_STATUSES]);
  const { data, error } = await (query.clientIds
    ? live.in("client_id", query.clientIds)
    : live);
  throwIf(error, "carmen_findings drafts");
  return (data ?? []).flatMap((row) => {
    const evidence = objectOf(row.evidence);
    const window = objectOf(evidence?.window ?? null);
    const from = window?.from;
    const to = window?.to;
    const severity = row.severity;
    if (
      !evidence ||
      typeof from !== "string" ||
      typeof to !== "string" ||
      !isFindingSeverity(severity)
    ) {
      return [];
    }
    const candidate: FindingCandidate = {
      ...row,
      kind: "card_stale_group",
      severity,
      evidence,
    };
    return [{ candidate, from, to }];
  });
}

/** The drafts to report again: card not updated since, still recent. */
export function keptDrafts(
  drafts: LiveDraft[],
  entries: CardEntry[],
  now: Date,
): FindingCandidate[] {
  const oldest = now.getTime() - LOOKBACK_DAYS * DAY_MS;
  return drafts
    .filter((draft) => {
      const clientId = draft.candidate.client_id;
      return (
        Date.parse(draft.to) >= oldest &&
        !(clientId && humanUpdateAfter(entries, clientId, draft.from))
      );
    })
    .map((draft) => draft.candidate);
}

/** A JSON object, or null. */
function objectOf(
  value: Json | null | undefined,
): { [key: string]: Json | undefined } | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}
