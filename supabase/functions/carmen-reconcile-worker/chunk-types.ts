/**
 * What a chunk of the nightly reconciliation runs on and answers (AIO-238).
 */
import type { CallBudget } from "../_shared/reconcile/budget.ts";
import type { ResyncSummary } from "../_shared/reconcile/run-summary.ts";
import type {
  AiosReader,
  ListedTable,
  PlatformSource,
  ReconcileFinding,
  ReconcileTable,
  RunStatus,
} from "../_shared/reconcile/types.ts";
import type { ResyncTrigger } from "./resync.ts";
import type { LatestRun, StoredRun } from "./store.ts";

export interface ReconcileStore {
  listTables(opts: {
    afterId: string | null;
    limit: number;
  }): Promise<ListedTable[]>;
  readAios: AiosReader;
  latestRun(tableId: string): Promise<LatestRun | null>;
  saveRun(run: StoredRun, findings: ReconcileFinding[]): Promise<string>;
}

export type ChunkDeps = {
  store: ReconcileStore;
  sourceFor: (table: ReconcileTable) => PlatformSource;
  budget: CallBudget;
  now: () => Date;
  deadline: number;
  triggerResync?: ResyncTrigger;
  log?: (message: string) => void;
};

export type ProcessedTable = {
  table_id: string;
  status: RunStatus;
  findings: number;
  error_kind?: string;
  /** platform_rate_limited: passed over, so the previous result still stands. */
  skipped_reason?: string;
  run_id?: string;
  save_error?: string;
  resync?: ResyncSummary;
};

export type ChunkResult = {
  processed: ProcessedTable[];
  next_cursor: string | null;
  done: boolean;
  stopped: "budget" | "deadline" | "max_tables" | null;
  api_calls: number;
  /** Tables passed over after a platform-wide rate limit, to try again later. */
  rate_limited_tables: string[];
};
