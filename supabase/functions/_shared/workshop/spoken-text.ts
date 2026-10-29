/**
 * How Carmen writes anything the film says (narration, a talking scene's line). The same text
 * is the film's caption, so a word the voice says wrong is fixed in Hebrew, where it still
 * reads right on screen.
 */
export const SPOKEN_TEXT_RULE =
  "הטקסט הזה הוא גם הכיתוב שעל המסך. מילה שהקול מבטא לא נכון מתקנים בעברית: מספר בספרות (1000 במקום אלף), או ניקוד על המילה (אֶלֶף). אף פעם לא באותיות לטיניות (elef), כי הן יופיעו בכתוביות.";

/** Appends the spoken-text rule to a field's own description. */
export const spokenField = (description: string) =>
  `${description} ${SPOKEN_TEXT_RULE}`;
