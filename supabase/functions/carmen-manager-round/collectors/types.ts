/**
 * The collector contract of Carmen's manager round (AIO-251).
 *
 * A collector turns AIOS data into finding candidates for one tenant. It is
 * deterministic: an LLM may only word text or classify chat intent, metered
 * and cached, and never drops a finding a rule raised.
 * The round decides when a collector is due, upserts its candidates
 * (carmen_finding_upsert), auto-clears the findings it no longer reports
 * (carmen_finding_mark_missing over `coverage`) and stores `watermark` only
 * after a successful run. Routing and sending are never a collector's job.
 *
 * Rules for every collector (chat SLA AIO-252, contact AIO-253, group
 * updates AIO-254):
 * - summary_he goes to staff word for word, and campaigners read summary_he
 *   and evidence through RLS: no direct-message text in either, and a group
 *   quote of at most 200 characters.
 * - Rows stored from Green API (David's phone) are read only through
 *   service-role SQL functions; nothing is ever sent through Green API.
 * - Only the tenant's own clients and clients of agencies shared with it; a
 *   group shared by several tenants is read once per group_chat_id.
 * - LLM use (chat intent only) is logged to ai_usage_log under the tenant and
 *   counted in the run's stats (chat/llm-meter.ts), capped per run by the
 *   round's time budget rather than by money, cached, with a deterministic
 *   fallback.
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
  /** The facts behind the finding. alert_type marks a Shabbat-critical alert (_shared/shabbat/critical-alerts.ts). */
  evidence: { [key: string]: Json | undefined };
  /** The person to hold responsible when known (e.g. the PBX caller); else the client's campaigner. */
  owner_user_id: string | null;
};

export type CollectorContext = {
  tenantId: string;
  settings: ManagerSettings;
  /** The tenant's pulse_alert_rules as stored now (RoundStateStore.loadRules), for a collector's own keys. */
  loadRules: () => Promise<Json | null>;
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
  /** A preview: the collector writes nothing, not even its own caches. */
  dryRun: boolean;
};

/** A live finding of the collector that its run saw end, closed with why. */
export type FindingResolution = {
  kind: FindingKind;
  fingerprint: string;
  resolution: "answered";
  /** Logged on the 'resolved' event, e.g. the response time. */
  details: { [key: string]: Json | undefined };
};

export type CollectorResult = {
  candidates: FindingCandidate[];
  watermark: Json | null;
  /**
   * What the run fully checked, for auto-clear: complete=false (budget ran
   * out) clears nothing; clientIds limits clearing to those clients, and
   * kinds to those kinds (default: all the collector's kinds; a kind turned
   * off is not checked, so its findings stay as they are).
   */
  coverage: {
    complete: boolean;
    clientIds: string[] | null;
    kinds?: readonly FindingKind[];
  };
  /** Findings to close now (e.g. a client wait staff answered), whatever `coverage` says. */
  resolved?: FindingResolution[];
  /** LLM use of this run, summed into the round's heartbeat_logs row. */
  llm?: { calls: number; costUsd: number };
  /** Why the run read less than it could (e.g. no monitored line), shown in its report. */
  note?: string;
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
