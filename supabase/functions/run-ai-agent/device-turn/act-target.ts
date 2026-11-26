/**
 * What a click or type may name (AIO-656): an element of the run's latest read, of the page
 * the tab still shows, with nothing since that may have changed it, and no page text from
 * another site in the run since the user last approved a move. The server checks the
 * model's arguments here; the panel then checks that the ref still names the same element.
 * A read's page text is cleared once the run uses it; the check reads what the row kept
 * instead (step-residue.ts).
 */
import {
  type DeviceActionStatus,
  DEVICE_TYPE_TEXT_MAX,
  type DeviceToolName,
} from "../../_shared/carmen/device/contract.ts";
import { isTypableText } from "../../_shared/carmen/device/typed-text.ts";
import type { RunStep } from "./rows.ts";
import { keptSnapshot } from "./step-residue.ts";

/** The snapshot a click or type may name, or why none may be named. */
export type ActTarget =
  | { refusal: null; snapshotId: string; refs: ReadonlyArray<string> }
  | { refusal: ActRefusal };

export type ActRefusal =
  /** The run has no read whose elements may be named. */
  | "no_snapshot"
  /** The page may have changed since the read: a move, a click that changed it, a step whose outcome is unknown. */
  | "page_changed"
  /** The run read another site since the user last approved a move (plan rule 9). */
  | "tainted";

/** The statuses of a step that never ran: it changed nothing on the page. */
const DID_NOT_RUN: ReadonlyArray<string> = [
  "denied",
  "target_changed",
  "cancelled",
  "expired",
] satisfies Array<DeviceActionStatus>;

/** The snapshot a click or type on the tab at `tabUrl` may name, from the run's steps in order. */
export function actTarget(
  steps: ReadonlyArray<RunStep>,
  tabUrl: string,
): ActTarget {
  const tab = URL.canParse(tabUrl) ? new URL(tabUrl) : null;
  const read = latestRead(steps);
  if (typeof read === "string") {
    return { refusal: read };
  }
  if (
    !tab ||
    read.step.observed_origin !== tab.origin ||
    read.step.observed_path !== tab.pathname
  ) {
    return { refusal: "page_changed" };
  }
  if (readsSinceLastMove(steps).some((origin) => origin !== tab.origin)) {
    return { refusal: "tainted" };
  }
  return {
    refusal: null,
    snapshotId: read.snapshot.snapshot_id,
    refs: read.snapshot.refs,
  };
}

/** What the model is told when its click or type names nothing it may act on. */
export const ACT_REFUSAL_MESSAGE: Record<ActArgumentsRefusal, string> = {
  no_snapshot: "קודם קוראים את הדף עם browser_read_page.",
  page_changed:
    "הדף השתנה מאז הקריאה האחרונה. קוראים אותו שוב עם browser_read_page.",
  tainted:
    "בתור הזה נקרא דף מאתר אחר, ולכן אין פעולה בדף הזה. אפשר לבקש אותה בהודעה חדשה.",
  stale_snapshot:
    "ה-snapshot_id אינו של הקריאה האחרונה של הדף. משתמשים בזה של הקריאה האחרונה.",
  unknown_ref: "ה-ref לא מופיע ברשימת האלמנטים של הקריאה האחרונה.",
  invalid_text: `הטקסט להקלדה ריק, ארוך מ-${DEVICE_TYPE_TEXT_MAX} תווים או מכיל תווי בקרה או כיווניות.`,
};

export type ActArgumentsRefusal =
  ActRefusal | "stale_snapshot" | "unknown_ref" | "invalid_text";

/**
 * Why a click or type may not run with these arguments, or null (null for every other
 * tool): the text must fit, and the ref must be one of the run's latest read of the page
 * the tab still shows (`actTarget`).
 */
export function actArgumentsRefusal(
  tool: DeviceToolName,
  args: Record<string, string>,
  steps: ReadonlyArray<RunStep>,
  tabUrl: string,
): ActArgumentsRefusal | null {
  if (tool !== "browser_click" && tool !== "browser_type") {
    return null;
  }
  if (tool === "browser_type" && !isTypableText(args.text)) {
    return "invalid_text";
  }
  const target = actTarget(steps, tabUrl);
  if (target.refusal !== null) {
    return target.refusal;
  }
  if (args.snapshot_id !== target.snapshotId) {
    return "stale_snapshot";
  }
  return target.refs.includes(args.ref) ? null : "unknown_ref";
}

/**
 * The run's latest done read with its kept snapshot, or why it may not be acted on: a step
 * after it that may have changed the page, or no read at all.
 */
function latestRead(
  steps: ReadonlyArray<RunStep>,
):
  | { step: RunStep; snapshot: { snapshot_id: string; refs: Array<string> } }
  | ActRefusal {
  for (const step of [...steps].reverse()) {
    if (step.tool === "browser_read_page") {
      if (step.status !== "done") {
        continue;
      }
      const snapshot = keptSnapshot(step.result);
      return snapshot ? { step, snapshot } : "no_snapshot";
    }
    if (DID_NOT_RUN.includes(step.status)) {
      continue;
    }
    // A move, or a click or type that changed the page or may have: every ref is stale.
    if (step.tool === "browser_navigate" || !leftPageAsItWas(step)) {
      return "page_changed";
    }
  }
  return "no_snapshot";
}

/** Whether a done click or type reported that the page stayed the one it acted on. */
function leftPageAsItWas(step: RunStep): boolean {
  const result = step.result;

  return (
    step.status === "done" &&
    !!result &&
    typeof result === "object" &&
    "changed" in result &&
    result.changed === false
  );
}

/** The origins of the run's done reads since its last navigation the user approved and that ran. */
function readsSinceLastMove(steps: ReadonlyArray<RunStep>): Array<string> {
  const lastMove = steps.findLastIndex(
    (step) => step.tool === "browser_navigate" && step.status === "done",
  );

  return steps
    .slice(lastMove + 1)
    .filter(
      (step) => step.tool === "browser_read_page" && step.status === "done",
    )
    .map((step) => step.observed_origin ?? "");
}
