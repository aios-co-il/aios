/**
 * Pictures carry no text and no place for it. The film's editor draws every caption and its end
 * card; an image model asked for a sign or a plaque to write on leaves it blank (Staging, 2 Nov:
 * the Snuba divers film showed an empty gold plaque under its offer).
 */

/** The end of every scene picture's prompt (workshop_make_stills). */
export const STILL_NO_TEXT =
  "Cinematic still frame for a video storyboard. No text on the image, and no signs, plaques, banners, labels or blank panels meant to hold text: the film adds its own text.";

/** How Carmen writes a picture's description. */
export const PICTURE_TEXT_RULE =
  "בלי טקסט ובלי מקום לטקסט: לא שלט, לוח, באנר או מסגרת ריקה לכיתוב. את הטקסט וכרטיס הסיום מוסיף העורך בסרט.";

/** Appends the picture-text rule to a field's own description. */
export const pictureField = (description: string) =>
  `${description} ${PICTURE_TEXT_RULE}`;
