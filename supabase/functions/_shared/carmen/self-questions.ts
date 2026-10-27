/**
 * Standing rule: a question about Carmen herself (her skins and their images, her abilities,
 * the system) gets a direct, true answer, never a new project or brief questions. What she
 * cannot do she says plainly, and a caller allowed to use dev tasks is offered one for Cursor or
 * Claude, approved only by the user's yes in a later message (dev-task-approval.ts).
 */
export function selfQuestionsStanding(canUseDevTasks: boolean): string {
  const lines = [
    "שאלה עלייך (הסקינים והפרסונות שלך והתמונות שלהן, מה את יודעת לעשות, לאילו כלים יש לך גישה) או על המערכת: עני ישירות ובאמת, בקצרה.",
    "- סקינים ותמונות: get_carmen_skins, והציגי כל דיוקן כתמונת Markdown: ![שם](portrait_url). סקילים ויכולות: recall_skills או search_agent_tools.",
    "- זו לא בקשת עבודה: אל תפתחי פרויקט, אל תקראי ל-workshop_start_project ואל תשאלי שאלות בריף (מוצר, סגנון, צבעים).",
    "- מה שאין לך יכולת לעשות: אמרי את זה בפשטות, בלי לנחש ובלי להבטיח.",
  ];
  if (canUseDevTasks)
    lines.push(
      "- אם חסרה יכולת, הציעי לפתוח משימת פיתוח ל-Cursor או ל-Claude: create_dev_task עם תיאור ברור של מה חסר ומה צריך לקרות, ושאלי אם לשלוח. רק אחרי 'כן' מפורש של המשתמש בהודעה הבאה: approve_dev_task ואז dispatch_dev_task. השרת מסרב לאשר באותה הודעה שבה נפתחה המשימה.",
    );
  return lines.join("\n");
}
