import { approvalCode, budgetPrompt } from "./budget.ts";
import type { Budget, BudgetRefusal, BudgetRequest } from "./budget-types.ts";

/** What Carmen is told to do when a paid step cannot run on the budget. */
export const BUDGET_REFUSAL: Record<BudgetRefusal, string> = {
  no_budget:
    "לפרויקט עוד אין תקציב מאושר. הציגי את התקציב המוצע ואת approval_prompt כמו שהוא, ועצרי עד שהמשתמש יאשר.",
  over_budget:
    "השלב הזה חורג מהתקציב שאושר. אמרי למשתמש כמה נשאר וכמה השלב עולה, הציגי את approval_prompt להגדלת התקציב, ועצרי.",
  same_turn:
    "המשתמש עוד לא ענה על התקציב. הציגי אותו עם approval_prompt ועצרי.",
  no_turn: "אי אפשר לאשר תקציב מהערוץ הזה. בקשי מהמשתמש לאשר בצ׳אט של כרמן.",
  not_user:
    "ההודעה של המשתמש לא כוללת את קוד האישור. הציגי את התקציב ואת approval_prompt כמו שהוא, ועצרי עד שהמשתמש ילחץ על מאשר.",
  expired:
    "בקשת התקציב פגה. הציגי למשתמש את התקציב המוצע ואת approval_prompt, ועצרי.",
};

const usd = (amount: number) => `$${Math.round(amount * 100) / 100}`;

/** What the user reads: the budget asked for, what this step costs, and the approve button. */
export function budgetMessage(
  budget: Budget,
  stepUsd: number,
  capUsd: number,
  request: BudgetRequest,
): string {
  const head =
    budget.cap_usd > 0
      ? `השלב הזה עולה כ-${usd(stepUsd)}, ובתקציב של הפרויקט נשארו ${usd(Math.max(0, budget.cap_usd - budget.spent_usd))}. להגדיל את התקציב ל-${usd(capUsd)}?`
      : `לפרויקט הזה אני מציעה תקציב של ${usd(capUsd)} (השלב הראשון כ-${usd(stepUsd)}). אחרי האישור אני ממשיכה בלי לשאול על כל שלב, ומתריעה רק אם צריך יותר.`;
  return `${head}\n${budgetPrompt(capUsd, request.code || approvalCode(request.token))}`;
}
