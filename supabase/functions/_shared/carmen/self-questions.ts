/**
 * Standing rule: a question about Carmen herself (her skins and their images, her abilities,
 * the system) gets a direct, true answer, never a new project or brief questions. What she
 * cannot do she says plainly, and a caller allowed to use dev tasks is offered one (David: Cursor
 * or Claude; Ana: a Cursor bug fix only). In the workshop it is sent only after the user's yes in
 * a later message (dev-task-approval.ts); elsewhere the usual dev-task flow applies.
 */
export function selfQuestionsStanding(opts: {
  /** The caller's dev-escalation tier (dev-escalation-auth.mjs). */
  tier: "full" | "bugfix" | null;
  /** The chat renders Markdown images (AIOS web chats, the video studio's too); WhatsApp does not. */
  markdownImages: boolean;
  /** The workshop chat, where an offered dev task waits for the user's yes in the next message. */
  inWorkshop?: boolean;
}): string {
  const lines = [
    "שאלה עלייך (הסקינים והפרסונות שלך והתמונות שלהן, מה את יודעת לעשות, לאילו כלים יש לך גישה) או על המערכת: עני ישירות ובאמת, בקצרה.",
    opts.markdownImages
      ? "- סקינים ותמונות: get_carmen_skins, והציגי כל דיוקן כתמונת Markdown: ![שם](portrait_url). סקילים ויכולות: recall_skills או search_agent_tools."
      : "- סקינים ותמונות: get_carmen_skins. הצ׳אט הזה לא מציג תמונות: כתבי את שם הפרסונה ואת הקישור portrait_url בשורה, בלי Markdown. סקילים ויכולות: recall_skills או search_agent_tools.",
    "- זו לא בקשת עבודה: אל תפתחי פרויקט, אל תקראי ל-workshop_start_project ואל תשאלי שאלות בריף (מוצר, סגנון, צבעים).",
    "- מה שאין לך יכולת לעשות: אמרי את זה בפשטות, בלי לנחש ובלי להבטיח.",
  ];
  const ask = opts.inWorkshop
    ? "ושאלי אם לשלוח: [[בחירה: לשלוח את משימת הפיתוח? | כן | לא]]. רק אחרי 'כן' של המשתמש בהודעה הבאה: approve_dev_task ואז dispatch_dev_task. השרת מסרב לאשר באותה הודעה שבה נפתחה המשימה."
    : "ושאלי אם לשלוח.";
  if (opts.tier === "full")
    lines.push(
      `- אם חסרה יכולת, הציעי לפתוח משימת פיתוח ל-Cursor או ל-Claude: create_dev_task עם תיאור ברור של מה חסר ומה צריך לקרות, ${ask}`,
    );
  else if (opts.tier === "bugfix")
    lines.push(
      `- אם משהו שבור (באג עם צעדי שחזור), הציעי תיקון באג ל-Cursor בלבד, עם צעדי שחזור והתנהגות צפויה מול בפועל, ${ask} יכולת חדשה, הרשאות או משימה ל-Claude: אמרי שרק דיוויד יכול לבקש.`,
    );
  return lines.join("\n");
}
