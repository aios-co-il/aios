/**
 * The chat collector's findings as stored. Open ones keep a wait's identity
 * stable between runs, are closed as answered when staff reply, and keep a
 * complaint reported as it was. Closed ones are never raised again: every
 * chat fingerprint names a message, so a finding a person resolved or
 * dismissed (or that was answered or cleared) stays closed while that
 * message is in the read window.
 */
import {
  FINDING_LIVE_STATUSES,
  isFindingKind,
  isFindingSeverity,
} from "../../../_shared/manager-round/kinds.ts";
import type { Json } from "../../../_shared/database.types.ts";
import { isJsonObject } from "../../../_shared/pulse/json.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";
import type { FindingCandidate } from "../types.ts";
import type { LiveChatFinding } from "./gate.ts";

const LIVE = `(${FINDING_LIVE_STATUSES.join(",")})`;

/** Live findings the collector `collectorId` raised in the tenant. */
export async function loadLiveChatFindings(
  db: DbClient,
  tenantId: string,
  collectorId: string,
): Promise<LiveChatFinding[]> {
  const { data, error } = await db
    .from("carmen_findings")
    .select(
      "kind, fingerprint, severity, client_id, agency_id, source_event_at, summary_he, evidence, owner_user_id",
    )
    .eq("tenant_id", tenantId)
    .eq("collector", collectorId)
    .in("status", [...FINDING_LIVE_STATUSES]);
  throwIf(error, "carmen_findings chat");
  return (data ?? []).flatMap((row): LiveChatFinding[] => {
    const { kind, severity } = row;
    if (!isFindingKind(kind) || !isFindingSeverity(severity)) {
      return [];
    }
    const evidence = isJsonObject(row.evidence) ? row.evidence : {};
    const stored: FindingCandidate = { ...row, kind, severity, evidence };
    return [
      {
        kind,
        fingerprint: row.fingerprint,
        firstPendingAt: dateOrNull(evidence.first_pending_at),
        stored,
      },
    ];
  });
}

/** `kind|fingerprint` of the collector's closed findings about messages since `since`. */
export async function loadClosedChatKeys(
  db: DbClient,
  tenantId: string,
  collectorId: string,
  since: Date,
): Promise<Set<string>> {
  const { data, error } = await db
    .from("carmen_findings")
    .select("kind, fingerprint")
    .eq("tenant_id", tenantId)
    .eq("collector", collectorId)
    .not("status", "in", LIVE)
    .gte("source_event_at", since.toISOString());
  throwIf(error, "carmen_findings chat closed");
  return new Set((data ?? []).map((row) => `${row.kind}|${row.fingerprint}`));
}

/** A parseable date string, or null. */
function dateOrNull(value: Json | undefined): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}
