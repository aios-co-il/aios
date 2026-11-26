/**
 * The `complete` body the panel sends to carmen-device-action for each way a read ends,
 * built to the function's report rules (`carmen-device-action/report.ts`): `done` carries
 * the result and where it was read, `denied` is a declined card (`ask`), `refused` asked
 * nobody (`never`), and every other status carries no result.
 */
import type { DeviceCardRule } from "../../../supabase/functions/_shared/carmen/device/card-rule.ts";
import type {
  PageLocation,
  PageSnapshot,
} from "../../../supabase/functions/_shared/carmen/device/results.ts";
import type { ActionReport } from "../../../supabase/functions/carmen-device-action/report.ts";

/** How one claimed read ended. */
export type ReadOutcome =
  /** `asked`: the panel showed its card first (the site was not granted yet). */
  | { status: "done"; asked: boolean; snapshot: PageSnapshot }
  /**
   * The user declined the card or Chrome's prompt. The contract's rule for a read is
   * `free`, but the report takes `denied` only with `ask`, and a card was drawn (AIO-656).
   */
  | { status: "denied"; observed: PageLocation }
  | { status: "refused" }
  | {
      status: "cancelled" | "expired" | "target_changed";
      /** The rule applied so far: null before the tab was ruled on. */
      decision: DeviceCardRule | null;
      observed: PageLocation | null;
    };

/** The body of `complete` for one action: the function's own report, with a read's result. */
export type CompleteBody = { action: "complete"; id: string } & Omit<
  ActionReport,
  "result"
> & { result: PageSnapshot | null };

/** The `complete` request for an action and how it ended. */
export function completeBody(id: string, outcome: ReadOutcome): CompleteBody {
  const base = { action: "complete", id, status: outcome.status } as const;

  switch (outcome.status) {
    case "done":
      return {
        ...base,
        decision: outcome.asked ? "ask" : "free",
        observed: {
          origin: outcome.snapshot.origin,
          path: outcome.snapshot.path,
        },
        result: outcome.snapshot,
      };
    case "denied":
      return {
        ...base,
        decision: "ask",
        observed: outcome.observed,
        result: null,
      };
    case "refused":
      // No address is reported for a page the panel refused to look at.
      return { ...base, decision: "never", observed: null, result: null };
    default:
      return {
        ...base,
        decision: outcome.decision,
        observed: outcome.observed,
        result: null,
      };
  }
}
