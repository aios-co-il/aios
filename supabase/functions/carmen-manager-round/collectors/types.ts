/**
 * The collector contract of Carmen's manager round (AIO-251).
 *
 * A collector turns AIOS data into finding candidates for one tenant. It is
 * deterministic: an LLM may only word text or classify chat intent where the
 * plan says so, metered and cached, and never drops a finding a rule raised.
 * The round decides when a collector is due, upserts its candidates
 * (carmen_finding_upsert), auto-clears the findings it no longer reports
 * (carmen_finding_mark_missing over `coverage`) and stores `watermark` only
 * after a successful run. Routing and sending are never a collector's job.
 */
import type { DbClient } from "../../_shared/supabase-clients.ts";
import type { Json } from "../../_shared/database.types.ts";
import type {
  FindingKind,
  FindingSeverity,
} from "../../_shared/manager-round/kinds.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { RoundBudget } from "../budget.ts";

export type FindingCandidate = {
  kind: FindingKind;
  /** Stable identity of the condition within (tenant, kind), e.g. `client:<id>:campaign:<id>`. */
  fingerprint: string;
  severity: FindingSeverity;
  /** The client must belong to the tenant or to an agency shared with it. */
  client_id: string | null;
  /** Filled from the client when null. */
  agency_id: string | null;
  /** ISO time of the event that triggered the finding; drives the notify_since gate. */
  source_event_at: string;
  /** One Hebrew line that names the client, sent as is. */
  summary_he: string;
  /** The facts behind the finding. alert_type marks a Shabbat-critical alert (_shared/critical-alerts.ts). */
  evidence: { [key: string]: Json | undefined };
  /** The person to hold responsible when known (e.g. the PBX caller); else the client's campaigner. */
  owner_user_id: string | null;
};

export type CollectorContext = {
  tenantId: string;
  settings: ManagerSettings;
  now: Date;
  /** End of the last successful run, or the collector's first run for this tenant. Never earlier. */
  since: Date;
  /** What this collector stored after its last successful run (cursor, snapshot time). */
  watermark: Json | null;
  budget: RoundBudget;
  /** Restrict to these clients (a manual run for one client), or null for all. */
  clientIds: string[] | null;
  /** Service-role client: every query must filter by tenantId. */
  db: DbClient;
  /** Request fixtures (non-production only); null in every scheduled run. */
  fixtures: Json | null;
};

export type CollectorResult = {
  candidates: FindingCandidate[];
  watermark: Json | null;
  /**
   * What the run fully checked, for auto-clear: complete=false (budget ran
   * out) clears nothing; clientIds limits clearing to those clients.
   */
  coverage: { complete: boolean; clientIds: string[] | null };
  /** LLM use of this run, summed into the round's heartbeat_logs row. */
  llm?: { calls: number; costUsd: number };
};

export type CollectorSchedule =
  /** A 5-field cron in Asia/Jerusalem; a slot older than staleMinutes is skipped, never replayed. */
  | { cron: string; staleMinutes?: number }
  /** A data trigger, e.g. a pulse snapshot computed_at newer than the watermark. */
  | { trigger: (ctx: CollectorContext) => Promise<boolean> };

export type Collector = {
  /** Stable key in carmen_round_state.collector. */
  id: string;
  /** Kinds it may emit; also the scope of its auto-clear and its notify floor. */
  kinds: readonly FindingKind[];
  detectorVersion: string;
  schedule: CollectorSchedule;
  /** Runs without the fixture the request names are skipped (the self-test collector). */
  fixturesOnly?: boolean;
  /** Consecutive runs without a finding before it is auto-cleared (default 2). */
  clearAfterMisses?: number;
  collect: (ctx: CollectorContext) => Promise<CollectorResult>;
};
