/** What workshop_make_stills tells Carmen about the pictures one call made. */

/** The outcome of one call, as the message reports it. */
export interface StillsOutcome {
  created: number;
  failed: Array<{ error?: string }>;
  /** Pictures made from their scene's own picture (reference_url). */
  ownMade: number;
  /** The project's reference pictures. */
  references: number;
  remaining: number;
  /** The approval note once the last picture is made (stills-approval.ts). */
  note?: string;
}

/** The message: what was made, from which references, and what Carmen does next. */
export function stillsMessage(outcome: StillsOutcome) {
  const { created, failed, ownMade, references, remaining } = outcome;
  if (created === 0) {
    return `לא נוצרה אף תמונה. ${failed[0]?.error ?? ""}`.trim();
  }
  return `${created} תמונות נוצרו והן כבר מופיעות בלוח, אין צורך לשלוח או לצרף אותן. ${
    ownMade > 0
      ? `${ownMade} מהן נוצרו לפי התמונה של הסצנה עצמה (reference_url), עם אותה דמות ואותו לבוש. `
      : ""
  }${
    ownMade === created
      ? ""
      : references > 0
        ? `נוצרו לפי ${references} רפרנסים ותמונת עוגן אחת לאחידות. `
        : "אין לפרויקט רפרנס: אם המשתמש צירף או הזכיר תמונה, העבירי אותה ב-reference_urls והציעי ליצור מחדש עם redo=true. "
  }${
    remaining > 0
      ? `נשארו ${remaining} סצנות בלי תמונה: קראי שוב ל-workshop_make_stills להמשך, בלי redo. כל עוד זה בתקציב זה ירוץ בלי לשאול.`
      : outcome.note
  }`;
}
