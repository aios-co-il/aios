import type { BudgetRefusal } from "./budget-types.ts";

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
