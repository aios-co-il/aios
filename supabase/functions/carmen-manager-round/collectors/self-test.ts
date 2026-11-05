/**
 * Self-test collector: echoes the candidates given in request fixtures
 * (`fixtures.self_test`), so a dry run on Preview or Staging can exercise
 * routing and message text end to end. Fixtures are refused in Production and
 * force a dry run, so this collector never writes a finding.
 */
import type { Json } from "../../_shared/database.types.ts";
import {
  FINDING_KINDS,
  isFindingKind,
  isFindingSeverity,
} from "../../_shared/manager-round/kinds.ts";
import type { Collector, FindingCandidate } from "./types.ts";

export const selfTestCollector: Collector = {
  id: "self_test",
  kinds: FINDING_KINDS,
  detectorVersion: "1",
  schedule: { cron: "* * * * *" },
  fixturesOnly: true,
  collect(ctx) {
    const raw = fixtureList(ctx.fixtures, "self_test");
    const candidates = raw.flatMap((item) => {
      const candidate = parseCandidate(item, ctx.now);
      return candidate ? [candidate] : [];
    });
    return Promise.resolve({
      candidates,
      watermark: null,
      coverage: { complete: false, clientIds: null },
    });
  },
};

/** The array under `key` in the fixtures, or an empty list. */
function fixtureList(fixtures: Json | null, key: string): Json[] {
  if (!fixtures || typeof fixtures !== "object" || Array.isArray(fixtures)) {
    return [];
  }
  const list = fixtures[key];
  return Array.isArray(list) ? list : [];
}

/** A fixture object with a known kind, a fingerprint and a summary; else null. */
function parseCandidate(item: Json, now: Date): FindingCandidate | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }
  const text = (key: string) => {
    const value = item[key];
    return typeof value === "string" ? value : null;
  };
  const kind = item.kind;
  const severity = item.severity ?? "warning";
  const fingerprint = text("fingerprint");
  const summary = text("summary_he");
  const evidence = item.evidence;
  if (
    !isFindingKind(kind) ||
    !isFindingSeverity(severity) ||
    !fingerprint ||
    !summary
  ) {
    return null;
  }
  return {
    kind,
    severity,
    fingerprint,
    summary_he: summary,
    client_id: text("client_id"),
    agency_id: text("agency_id"),
    source_event_at: text("source_event_at") ?? now.toISOString(),
    evidence:
      evidence && typeof evidence === "object" && !Array.isArray(evidence)
        ? evidence
        : {},
    owner_user_id: text("owner_user_id"),
  };
}
