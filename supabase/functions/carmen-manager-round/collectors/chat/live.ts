/**
 * The chat collector's open findings: they keep a wait's identity and kinds
 * stable between runs, and are closed as answered when staff reply.
 */
import {
  FINDING_LIVE_STATUSES,
  isFindingKind,
} from "../../../_shared/manager-round/kinds.ts";
import type { Json } from "../../../_shared/database.types.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";
import type { LiveChatFinding } from "./gate.ts";

/** Live findings the collector `collectorId` raised in the tenant. */
export async function loadLiveChatFindings(
  db: DbClient,
  tenantId: string,
  collectorId: string,
): Promise<LiveChatFinding[]> {
  const { data, error } = await db
    .from("carmen_findings")
    .select("kind, fingerprint, evidence")
    .eq("tenant_id", tenantId)
    .eq("collector", collectorId)
    .in("status", [...FINDING_LIVE_STATUSES]);
  throwIf(error, "carmen_findings chat");
  return (data ?? []).flatMap((row) =>
    isFindingKind(row.kind)
      ? [
          {
            kind: row.kind,
            fingerprint: row.fingerprint,
            firstPendingAt: firstPendingAt(row.evidence),
          },
        ]
      : [],
  );
}

/** evidence.first_pending_at when it is a date. */
function firstPendingAt(evidence: Json): string | null {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return null;
  }
  const value = evidence.first_pending_at;
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}
