/**
 * Words that mark a client complaint in Hebrew text (and the update types
 * "red_flag" and, before AIO-516, "complaint"). One list for the DMM dashboard's card-update flag
 * and the manager round's chat complaint gate (AIO-252). Imported by Vite and
 * Deno, so it has no runtime imports.
 */
const COMPLAINT_PATTERN = /red_flag|complaint|תלונה|לא מרוצ|בעיה חמורה/;

/**
 * Serious complaint words: leaving or cancelling the service, a refund, a
 * legal threat, or anger. A model read never clears a complaint they raise;
 * only a person does (AIO-522).
 */
const SERIOUS_PATTERN =
  /כועס|עצבן|לעזוב אתכם|עוזבים אתכם|לסיים את ההתקשרות|לבטל את ההתקשרות|לבטל את החוזה|לבטל את השירות|לסוכנות אחרת|החזר כספי|להחזיר את הכסף|תחזירו את הכסף|הכסף בחזרה|refund|עורך דין|עורכת דין|עו["״]ד|תביעה|לתבוע|מכתב התראה|צעדים משפטיים/;

/** True when the text carries a complaint word (case-insensitive). */
export function hasComplaintWords(text: string): boolean {
  return (
    COMPLAINT_PATTERN.test(text.toLowerCase()) || hasSeriousComplaintWords(text)
  );
}

/** True when the text carries a serious complaint word (case-insensitive). */
export function hasSeriousComplaintWords(text: string): boolean {
  return SERIOUS_PATTERN.test(text.toLowerCase());
}
