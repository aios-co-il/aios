/** Findings persistence of the round: thin, tenant-scoped calls to the RPCs. */
import { FINDING_LIVE_STATUSES } from "../../_shared/manager-round/kinds.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import type {
  FindingCandidate,
  FindingResolution,
} from "../collectors/types.ts";
import { throwIf } from "../db-error.ts";
import {
  FINDING_COLUMNS,
  type FindingRow,
  type RouteDecision,
  type UpsertOutcome,
} from "./types.ts";

/** Live statuses the router still acts on (acknowledged stops the ladder). */
const ROUTABLE_STATUSES = ["open", "notified", "snoozed"];

export type MissingScope = {
  kind: string;
  seen: string[];
  clientIds: string[] | null;
  fingerprints: string[] | null;
  afterMisses: number;
};

export type FindingsStore = {
  upsert(
    tenantId: string,
    roundId: string,
    collector: { id: string; detectorVersion: string },
    candidates: FindingCandidate[],
  ): Promise<UpsertOutcome[]>;
  /** Closes the collector's live findings named in `items`; returns how many. */
  resolve(
    tenantId: string,
    roundId: string,
    collectorId: string,
    items: FindingResolution[],
  ): Promise<number>;
  /** Counts a miss for live findings in scope; returns how many were auto-cleared. */
  markMissing(
    tenantId: string,
    roundId: string,
    scope: MissingScope,
  ): Promise<number>;
  /** Live findings never routed, or whose next action is due. */
  listRoutable(
    tenantId: string,
    now: Date,
    limit: number,
  ): Promise<FindingRow[]>;
  /** Live findings, newest first (for the brief), optionally of some kinds only. */
  listLive(
    tenantId: string,
    limit: number,
    kinds?: readonly string[],
  ): Promise<FindingRow[]>;
  byIds(tenantId: string, ids: string[]): Promise<FindingRow[]>;
  applyRoute(
    tenantId: string,
    roundId: string,
    decisions: RouteDecision[],
  ): Promise<number>;
};

/** FindingsStore over the service-role client. Every call names the tenant. */
export function createFindingsStore(db: DbClient): FindingsStore {
  return {
    async upsert(tenantId, roundId, collector, candidates) {
      if (!candidates.length) {
        return [];
      }
      const { data, error } = await db.rpc("carmen_finding_upsert", {
        p_tenant_id: tenantId,
        p_round_id: roundId,
        p_collector: collector.id,
        p_detector_version: collector.detectorVersion,
        p_candidates: candidates,
      });
      throwIf(error, "carmen_finding_upsert");
      return data ?? [];
    },

    async resolve(tenantId, roundId, collectorId, items) {
      if (!items.length) {
        return 0;
      }
      const { data, error } = await db.rpc("carmen_finding_resolve", {
        p_tenant_id: tenantId,
        p_round_id: roundId,
        p_collector: collectorId,
        p_items: items,
      });
      throwIf(error, "carmen_finding_resolve");
      return data?.length ?? 0;
    },

    async markMissing(tenantId, roundId, scope) {
      const { data, error } = await db.rpc("carmen_finding_mark_missing", {
        p_tenant_id: tenantId,
        p_kind: scope.kind,
        p_seen: scope.seen,
        p_client_ids: scope.clientIds ?? undefined,
        p_fingerprints: scope.fingerprints ?? undefined,
        p_after_misses: scope.afterMisses,
        p_round_id: roundId,
      });
      throwIf(error, "carmen_finding_mark_missing");
      return data?.length ?? 0;
    },

    async listRoutable(tenantId, now, limit) {
      const { data, error } = await db
        .from("carmen_findings")
        .select(FINDING_COLUMNS)
        .eq("tenant_id", tenantId)
        .in("status", ROUTABLE_STATUSES)
        .or(`routed_at.is.null,next_action_at.lte.${now.toISOString()}`)
        .order("first_seen_at", { ascending: true })
        .limit(limit);
      throwIf(error, "carmen_findings routable");
      return data ?? [];
    },

    async listLive(tenantId, limit, kinds) {
      const live = db
        .from("carmen_findings")
        .select(FINDING_COLUMNS)
        .eq("tenant_id", tenantId)
        .in("status", [...FINDING_LIVE_STATUSES]);
      const { data, error } = await (kinds ? live.in("kind", [...kinds]) : live)
        .order("last_seen_at", { ascending: false })
        .limit(limit);
      throwIf(error, "carmen_findings live");
      return data ?? [];
    },

    async byIds(tenantId, ids) {
      if (!ids.length) {
        return [];
      }
      const { data, error } = await db
        .from("carmen_findings")
        .select(FINDING_COLUMNS)
        .eq("tenant_id", tenantId)
        .in("id", ids);
      throwIf(error, "carmen_findings by id");
      return data ?? [];
    },

    async applyRoute(tenantId, roundId, decisions) {
      if (!decisions.length) {
        return 0;
      }
      const { data, error } = await db.rpc("carmen_finding_apply_route", {
        p_tenant_id: tenantId,
        p_round_id: roundId,
        p_decisions: decisions,
      });
      throwIf(error, "carmen_finding_apply_route");
      return data ?? 0;
    },
  };
}
