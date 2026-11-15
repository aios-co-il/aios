/**
 * The one check's outcome from carmen-manager-round's report (round.ts
 * RoundReport): the tenant's mode and the collector's counts. The report is
 * read as untrusted JSON, so a missing field reads as zero or null.
 */
import type {
  CollectorRunResult,
  RunnableCollectorId,
} from "../_shared/manager-round/runnable-collectors.ts";

/** The named check's result, or an error result when the report lacks it. */
export function collectorResult(
  report: unknown,
  tenantId: string,
  collector: RunnableCollectorId,
): CollectorRunResult {
  const tenant = listOf(field(report, "tenants")).find(
    (entry) => field(entry, "tenant_id") === tenantId,
  );
  const mode = String(field(tenant, "mode") ?? "unknown");
  const skipped = field(tenant, "skipped");
  const failure = field(tenant, "error");
  const run = listOf(field(tenant, "collectors")).find(
    (entry) => field(entry, "id") === collector,
  );
  if (!run) {
    return empty(
      mode,
      typeof skipped === "string" ? "skipped" : "error",
      typeof skipped === "string"
        ? skipped
        : typeof failure === "string"
          ? failure
          : "not_run",
    );
  }
  const status = field(run, "status");
  return {
    mode,
    status: status === "ok" || status === "skipped" ? status : "error",
    reason: stringOrNull(field(run, "reason")),
    candidates: count(field(run, "candidates")),
    inserted: count(field(run, "inserted")),
    cleared: count(field(run, "cleared")),
    llmCalls: count(field(field(run, "llm"), "calls")),
  };
}

/** A result with no counts. */
function empty(
  mode: string,
  status: CollectorRunResult["status"],
  reason: string,
): CollectorRunResult {
  return {
    mode,
    status,
    reason,
    candidates: 0,
    inserted: 0,
    cleared: 0,
    llmCalls: 0,
  };
}

/** `value[key]` when value is an object, else undefined. */
function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** `value` when it is an array, else empty. */
function listOf(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : [];
}

/** A non-negative whole count, 0 for anything else. */
function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/** The string, or null. */
function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
