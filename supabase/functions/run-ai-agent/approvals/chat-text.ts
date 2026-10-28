import { buildApprovalConfirmPromptRule } from "../../_shared/wa-approval-flow.ts";
import { approvalDisplayCode } from "./codes.ts";
import type { ApprovalPick, PickRow } from "./types.ts";

/** Text Carmen sends for a non-match pick on the deterministic path. */
export function formatApprovalPickReply(
  pick: ApprovalPick | null | undefined,
  { nowMs = Date.now() }: { nowMs?: number } = {},
): string {
  if (!pick) {
    return "";
  }

  if (pick.kind === "forbidden") {
    return pick.reason === "approver_role_required"
      ? approverOnlyText(pick.row)
      : "לא ביצעתי כלום: אין לך הרשאה לאשר את הבקשה הזו.";
  }

  const lines = formatApprovalCandidateLines(pick.candidates, { nowMs });
  if (lines.length === 0) {
    return "לא ביצעתי כלום: אין כרגע בקשה פתוחה שאפשר לאשר מכאן.";
  }

  const example = approvalDisplayCode(pick.candidates[0], pick.candidates);
  const intro =
    pick.kind === "code_not_found"
      ? `לא מצאתי בקשה פתוחה עם הקוד ${pick.code}. הבקשות שאפשר לאשר:`
      : "לא ביצעתי כלום, כי לא ברור לאיזו בקשה התכוונת. הבקשות הפתוחות:";
  return `${intro}\n${lines.join("\n")}\n\nלאישור יש לשלוח "כן" ואחריו הקוד, למשל: כן ${example}`;
}

/** System-prompt rule for the LLM path after an approval reply. */
export function buildApprovalPickPromptRule(
  pick: ApprovalPick | null | undefined,
  { nowMs = Date.now() }: { nowMs?: number } = {},
): string {
  if (!pick) {
    return "";
  }

  if (pick.kind === "match") {
    return buildApprovalConfirmPromptRule(pick.row);
  }

  const never =
    "אסור לקרוא ל-execute_pending_approval ואסור לכתוב שבוצעה פעולה.";
  if (pick.kind === "no_identity") {
    return `\n\nℹ️ **אישור:** לא זיהיתי מי כותב, ולכן אי אפשר לאשר מכאן בקשות פתוחות. ${never} אם ה"כן" עונה על שאלה אחרת שלך — המשיכי כרגיל.`;
  }

  if (pick.kind === "forbidden") {
    return `\n\n⛔ **אישור:** ${approverOnlyText(pick.row)} ${never} הסבירי זאת בקצרה.`;
  }

  const lines = formatApprovalCandidateLines(pick.candidates, { nowMs });
  const list = lines.length ? `\n${lines.join("\n")}` : "";
  const ask = lines.length
    ? 'אם המשתמש התכוון לאשר, הציגי את הרשימה ובקשי לענות "כן" ואחריו הקוד (למשל "כן 1234").'
    : "אין כרגע בקשה פתוחה שהמשתמש יכול לאשר. אם צריך, הכיני את הבקשה מחדש פעם אחת ובקשי אישור.";
  if (pick.kind === "ambiguous") {
    return `\n\n❓ **אישור:** יש כמה בקשות פתוחות ולא ברור איזו המשתמש מאשר. ${never} ${ask}${list}`;
  }

  if (pick.kind === "code_not_found") {
    return `\n\nℹ️ **אישור:** הקוד ${pick.code} לא תואם אף בקשה פתוחה. אם המספר עונה על שאלה אחרת שלך — המשיכי כרגיל. ${never} ${ask}${list}`;
  }

  return `\n\nℹ️ **אישור:** אין בקשת אישור פתוחה של המשתמש בשיחה הזו מ-30 הדקות האחרונות. אם ה"כן" עונה על שאלה אחרת שלך — המשיכי כרגיל. ${never} ${ask}${list}`;
}

/** "• 4821 · שינוי תקציב FB … (לפני 5 דק׳)" lines, at most `limit`. */
function formatApprovalCandidateLines(
  candidates: readonly PickRow[] | null | undefined,
  { nowMs = Date.now(), limit = 5 }: { nowMs?: number; limit?: number } = {},
): string[] {
  const list = Array.isArray(candidates) ? candidates : [];
  const lines = list.slice(0, limit).map((r) => {
    const title = r.title || r.tool_name || "פעולה";
    const age = approvalAgeHe(r.created_at, nowMs);
    return `• ${approvalDisplayCode(r, list)} · ${title}${age ? ` (${age})` : ""}`;
  });
  if (list.length > limit) {
    lines.push(`ועוד ${list.length - limit} בקשות במסך האישורים`);
  }

  return lines;
}

/** Why Carmen did not run an approver-only row for this caller. */
function approverOnlyText(
  row: { title?: string | null; tool_name?: string | null } | null | undefined,
): string {
  const title = row?.title || row?.tool_name || "הפעולה";
  return `"${title}" דורשת אישור של בעלים או מנהל/ת סוכנות, ולכן לא ביצעתי אותה. הבקשה ממתינה בתור האישורים.`;
}

/** How long ago a row was created, in short Hebrew ("לפני 5 דק׳"); "" when unknown. */
function approvalAgeHe(createdAt: string, nowMs: number): string {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) {
    return "";
  }

  const min = Math.max(0, Math.round((nowMs - t) / 60000));
  if (min < 1) {
    return "עכשיו";
  }

  if (min < 60) {
    return `לפני ${min} דק׳`;
  }

  const hours = Math.round(min / 60);
  if (hours < 24) {
    return hours === 1 ? "לפני שעה" : `לפני ${hours} שעות`;
  }

  const days = Math.round(hours / 24);
  return days === 1 ? "לפני יום" : `לפני ${days} ימים`;
}
