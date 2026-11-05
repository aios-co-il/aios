/**
 * How Carmen writes anything the film says (narration, a talking scene's line). The same text
 * is the film's caption, so it stays without nikud: the render worker adds full nikud to the
 * copy the voice engine hears (render-worker/src/jobs/vocalize.ts). A word the voice still says
 * wrong is fixed in Hebrew, where it still reads right on screen.
 */
export const SPOKEN_TEXT_RULE =
  "הטקסט הזה הוא גם הכיתוב שעל המסך, ולכן כותבים אותו בלי ניקוד: ניקוד מלא נוסף אוטומטית רק לקול. מילה שהקול עדיין מבטא לא נכון מתקנים בעברית, למשל מספר בספרות (1000 במקום אלף). אף פעם לא באותיות לטיניות (elef), כי הן יופיעו בכתוביות.";

/** Appends the spoken-text rule to a field's own description. */
export const spokenField = (description: string) =>
  `${description} ${SPOKEN_TEXT_RULE}`;
