/**
 * Carmen's own card writes: for each kind in team mode with
 * manager.kinds.<kind>.card_write on, the drafted entry of every live finding
 * is written to the client card and the finding is closed, before routing,
 * so nobody is asked to approve what is already on the card. Only events at
 * or after the kind's notify_since and its collector's first run qualify
 * (the same gate as sending); an older draft waits for a person. observe and
 * david_only never write, and a settings change during the writes stops the
 * rest, as it stops sends. A dry run only counts.
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
import {
  kindMode,
  kindNotifySince,
} from "../../_shared/manager-round/modes.ts";
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { FindingsStore } from "../findings/store.ts";
import type { FindingRow } from "../findings/types.ts";
import { isDeliverable, type NotifyFloors } from "../router/route.ts";

export type CardWriteReport = {
  written: number;
  /** Would be written (dry run). */
  planned: number;
  failed: number;
  /**
   * Written, but someone closed the finding meanwhile (a person approved it),
   * so the closing function answered false.
   */
  already_closed: number;
  /** Findings written (or, in a dry run, to be written); never routed. */
  finding_ids: string[];
  /** A settings change stopped the writes; the rest wait for the next round. */
  stopped: boolean;
  /** The first failed write's error, kept in the heartbeat row. */
  error: string | null;
};

export type AutowriteRun = {
  tenantId: string;
  settings: ManagerSettings;
  floors: NotifyFloors;
  dryRun: boolean;
  /** True once the stored settings differ from `settings`; checked before each write. */
  settingsChanged: () => Promise<boolean>;
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
  const stored = await deps.findings.listLive(
    run.tenantId,
    SCAN_LIMIT,
    kinds,
    earliestNotifySince(kinds, run.settings),
  );
  const due = [...stored, ...(run.virtual ?? [])].filter((finding) =>
    isDue(finding, kinds, run),
  );
  if (run.dryRun) {
    return report({ planned: due.length, finding_ids: due.map((f) => f.id) });
  }
  return writeAll(deps.cardDrafts, run, due);
}

/** Kinds in team mode with card_write on. */
export function writingKinds(settings: ManagerSettings): FindingKind[] {
  return FINDING_KINDS.filter(
    (kind) =>
      kindMode(settings, kind) === "team" &&
      settings.kinds[kind]?.card_write === true,
  );
}

/**
 * The earliest notify_since of the writing kinds. No older event is ever
 * written (isDeliverable), so the scan starts there and older drafts cannot
 * fill it.
 */
function earliestNotifySince(
  kinds: FindingKind[],
  settings: ManagerSettings,
): string | undefined {
  const times = kinds.flatMap((kind) => {
    const since = kindNotifySince(settings, kind);
    return since ? [Date.parse(since)] : [];
  });
  return times.length ? new Date(Math.min(...times)).toISOString() : undefined;
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

/**
 * Writes each draft while the settings stand; a failure is counted and
 * logged, and the rest go on. After a settings change the rest wait for the
 * next round, which reads the new settings.
 */
async function writeAll(
  ports: CardDraftWritePorts,
  run: AutowriteRun,
  due: FindingRow[],
): Promise<CardWriteReport> {
  const done = report({});
  for (const finding of due) {
    const draft = cardDraftOf(finding.evidence);
    if (!draft || !finding.client_id) {
      continue;
    }
    if (await run.settingsChanged()) {
      done.stopped = true;
      break;
    }
    try {
      const written = await writeCardDraft(ports, {
        tenantId: run.tenantId,
        finding: { ...finding, client_id: finding.client_id },
        draft,
        approvedBy: null,
      });
      done.written += 1;
      done.finding_ids.push(finding.id);
      if (!written.resolved) {
        done.already_closed += 1;
      }
    } catch (error) {
      done.failed += 1;
      done.error ??= error instanceof Error ? error.message : String(error);
      console.error("[carmen-manager-round] card write", finding.id, error);
    }
  }
  return done;
}

/** A report with zero counts by default. */
function report(fields: Partial<CardWriteReport>): CardWriteReport {
  return {
    written: 0,
    planned: 0,
    failed: 0,
    already_closed: 0,
    finding_ids: [],
    stopped: false,
    error: null,
    ...fields,
  };
}
