/**
 * How Carmen writes a scene's motion for the video engine. The film's editor draws every caption
 * (overlay_text, the end card); a video model asked for text draws garbled Hebrew (Staging,
 * 2 Nov). The render worker also drops such sentences (render-worker textless-motion.ts).
 */
export const MOTION_TEXT_RULE =
  "רק תנועה של מה שבתמונה, בלי טקסט: לא לבקש טקסט, כיתוב, כותרת או לוגו שזזים או צפים. את הטקסט מוסיף העורך בסרט (overlay_text וכרטיס הסיום), ומנוע הווידאו מצייר טקסט משובש.";

/** Appends the motion-text rule to a field's own description. */
export const motionField = (description: string) =>
  `${description} ${MOTION_TEXT_RULE}`;
