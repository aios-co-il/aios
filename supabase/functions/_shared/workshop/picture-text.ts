/**
 * Pictures carry no text and no place for it. The film's editor draws every caption and its end
 * card; an image model asked for a sign or a plaque to write on leaves it blank (Staging, 2 Nov:
 * the Snuba divers film showed an empty gold plaque under its offer), and one asked for a map of
 * nodes labels them with made-up English words (Staging, 5 Nov: "madix", "salles" beside glowing
 * nodes, though the description said "No text in the image"). The still engines take no negative
 * prompt, so the rule is spelled out in the prompt itself.
 */

/** The end of every scene picture's prompt (workshop_make_stills). */
export const STILL_NO_TEXT =
  "Cinematic still frame for a video storyboard. No text on the image at all: no letters, no words, no numbers, no labels, no captions, no logos with lettering, no UI text and no writing in any language, not even small or blurred, and no signs, plaques, banners, labels or blank panels meant to hold text: the film adds its own text.";

/** A picture of things a model tends to label: nodes, maps, charts, screens, dashboards. */
const LABELLED_THINGS =
  /\b(nodes?|dots?|points?|maps?|charts?|graphs?|diagrams?|networks?|screens?|dashboards?|monitors?|laptops?|phones?|tablets?|interfaces?|ui|icons?|labels?|labell?ed|infographics?|flow ?charts?|timelines?)\b/i;

/**
 * The still prompt's closing rule for this picture: STILL_NO_TEXT, and for a picture of nodes,
 * charts or screens the same rule for those things, which models otherwise label.
 */
export function stillNoText(visual: string): string {
  return LABELLED_THINGS.test(visual)
    ? `${STILL_NO_TEXT} Every node, dot, map, chart, graph, screen or icon is drawn as pure unlabeled shapes, lines and light, with nothing written on it or next to it.`
    : STILL_NO_TEXT;
}

/** How Carmen writes a picture's description. */
export const PICTURE_TEXT_RULE =
  "בלי טקסט ובלי מקום לטקסט: לא שלט, לוח, באנר או מסגרת ריקה לכיתוב, ולא תוויות, שמות או מספרים ליד צמתים, נקודות, גרפים או מסכים (תארי אותם כצורות ואור בלי כיתוב). את הטקסט וכרטיס הסיום מוסיף העורך בסרט.";

/** Appends the picture-text rule to a field's own description. */
export const pictureField = (description: string) =>
  `${description} ${PICTURE_TEXT_RULE}`;
