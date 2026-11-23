import type { CardDraftApproveResult } from "../../../supabase/functions/_shared/manager-round/card-drafts-approve.ts";
import type { DismissResult } from "./useDismissCardDrafts";

/** A toast's text: what went through, and what did not with why. */
export type DraftFeedback = { done: string | null; failed: string | null };

const DISMISS_REFUSALS_HE: Record<string, string> = {
  owner_only: "רק בעלי הארגון יכולים לדחות עדכונים",
  finding_closed: "העדכון כבר נסגר",
  finding_not_found: "העדכון לא נמצא",
};

/** The approval's outcome in one success line and one failure line. */
export function approveFeedback(
  results: Array<CardDraftApproveResult>,
): DraftFeedback {
  /** How many results have this status. */
  function count(status: CardDraftApproveResult["status"]): number {
    return results.filter((result) => result.status === status).length;
  }

  const approved = count("approved");
  const reasons = [
    count("not_found") && `${count("not_found")} לא נמצאו או שאין לך הרשאה`,
    count("no_draft") && `${count("no_draft")} בלי טיוטה לרישום`,
    count("error") && `${count("error")} נכשלו ברישום`,
  ].filter((reason): reason is string => !!reason);
  return {
    done: approved
      ? `${counted(approved, "נרשם", "נרשמו")} בכרטיס הלקוח`
      : null,
    failed: reasons.length ? `לא אושרו: ${reasons.join(", ")}` : null,
  };
}

/** The dismissal's outcome, naming the database's refusal. */
export function dismissFeedback(results: Array<DismissResult>): DraftFeedback {
  const failed = results.filter((result) => result.error);
  const dismissed = results.length - failed.length;
  const reasons = [
    ...new Set(
      failed.map(
        (result) => DISMISS_REFUSALS_HE[result.error ?? ""] ?? "הדחייה נכשלה",
      ),
    ),
  ];
  return {
    done: dismissed ? counted(dismissed, "נדחה", "נדחו") : null,
    failed: failed.length
      ? `${counted(failed.length, "לא נדחה", "לא נדחו")}: ${reasons.join(", ")}`
      : null,
  };
}

/** "עדכון אחד <singular>" or "N עדכונים <plural>". */
function counted(n: number, singular: string, plural: string): string {
  return n === 1 ? `עדכון אחד ${singular}` : `${n} עדכונים ${plural}`;
}
