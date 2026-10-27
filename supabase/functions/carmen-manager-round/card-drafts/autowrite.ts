/**
 * Carmen's own card writes (plan C14 write_card): for each kind in team mode
 * with manager.kinds.<kind>.card_write on, the drafted entry of every live
 * finding is written to the client card and the finding is closed, before
 * routing, so nobody is asked to approve what is already on the card. Only
 * events at or after the kind's notify_since and its collector's first run
 * qualify (the same gate as sending); an older draft waits for a person.
 * observe and david_only never write. A dry run only counts.
 */
import { cardDraftOf } from "../../_shared/manager-round/card-draft.ts";
import {
  writeCardDraft,
  type CardDraftWritePorts,
} from "../../_shared/manager-round/card-draft-write.ts";
import {
  FINDING_KINDS,
  type FindingKind,
  isFindingKind,
} from "../../_shared/manager-round/kinds.ts";
import { kindMode } from "../../_shared/manager-round/modes.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { FindingsStore } from "../findings/store.ts";
import type { FindingRow } from "../findings/types.ts";
import { isDeliverable, type NotifyFloors } from "../router/route.ts";

export type CardWriteReport = {
  written: number;
  /** Would be written (dry run). */
  planned: number;
  failed: number;
  finding_ids: string[];
};

export type AutowriteRun = {
  tenantId: string;
  settings: ManagerSettings;
  floors: NotifyFloors;
  dryRun: boolean;
  /** A dry run's candidates as unstored findings (dry-run.ts). */
  virtual?: FindingRow[];
};

/** At most this many drafts are written per tenant run; the rest wait a round. */
const SCAN_LIMIT = 50;

/** Writes the due drafts; null when no kind writes the card. */
export async function writeTeamDrafts(
  deps: { findings: FindingsStore; cardDrafts: CardDraftWritePorts },
  run: AutowriteRun,
): Promise<CardWriteReport | null> {
  const kinds = writingKinds(run.settings);
  if (!kinds.length) {
    return null;
  }
  const stored = await deps.findings.listLive(run.tenantId, SCAN_LIMIT, kinds);
  const due = [...stored, ...(run.virtual ?? [])].filter((finding) =>
    isDue(finding, kinds, run),
  );
  if (run.dryRun) {
    return report({ planned: due.length, finding_ids: due.map((f) => f.id) });
  }
  return writeAll(deps.cardDrafts, run.tenantId, due);
}

/** Kinds in team mode with card_write on. */
export function writingKinds(settings: ManagerSettings): FindingKind[] {
  return FINDING_KINDS.filter(
    (kind) =>
      kindMode(settings, kind) === "team" &&
      settings.kinds[kind]?.card_write === true,
  );
}

/** A finding of a writing kind with a draft, a client and an event Carmen may act on. */
function isDue(
  finding: FindingRow,
  kinds: FindingKind[],
  run: AutowriteRun,
): boolean {
  const kind = finding.kind;
  return (
    isFindingKind(kind) &&
    kinds.includes(kind) &&
    !!finding.client_id &&
    !!cardDraftOf(finding.evidence) &&
    isDeliverable(finding, kind, run.settings, run.floors)
  );
}

/** Writes each draft; a failure is counted and logged, and the rest go on. */
async function writeAll(
  ports: CardDraftWritePorts,
  tenantId: string,
  due: FindingRow[],
): Promise<CardWriteReport> {
  const done = report({});
  for (const finding of due) {
    const draft = cardDraftOf(finding.evidence);
    if (!draft || !finding.client_id) {
      continue;
    }
    try {
      await writeCardDraft(ports, {
        tenantId,
        finding: { ...finding, client_id: finding.client_id },
        draft,
        approvedBy: null,
      });
      done.written += 1;
      done.finding_ids.push(finding.id);
    } catch (error) {
      done.failed += 1;
      console.error("[carmen-manager-round] card write", finding.id, error);
    }
  }
  return done;
}

/** A report with zero counts by default. */
function report(fields: Partial<CardWriteReport>): CardWriteReport {
  return { written: 0, planned: 0, failed: 0, finding_ids: [], ...fields };
}
