/**
 * Words that mark a client complaint in Hebrew text (and the update types
 * "red_flag" and, before AIO-516, "complaint"). One list for the DMM dashboard's card-update flag
 * and the manager round's chat complaint gate (AIO-252). Imported by Vite and
 * Deno, so it has no runtime imports.
 */
const COMPLAINT_PATTERN =
  /red_flag|complaint|תלונה|לא מרוצ|כועס|עצבן|בעיה חמורה/;

/** True when the text carries a complaint word (case-insensitive). */
export function hasComplaintWords(text: string): boolean {
  return COMPLAINT_PATTERN.test(text.toLowerCase());
}
