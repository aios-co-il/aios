/**
 * What workshop_storyboard answers while the film has no concept the user chose (film-concept.ts):
 * the tap question over the board's concepts, or Carmen's brief to write them first, with why
 * what she passed was refused.
 */

import { CONCEPT_LABEL, tapTitle } from "../film-script.ts";
import type { FilmConcept } from "./film-concept.ts";
import { skipRefused } from "./skip-request.ts";

export interface ConceptGate {
  needs_input: true;
  missing: ["concept"];
  say_to_user: string;
  carmen_next: string;
}

/**
 * Asks the user to choose among the board's concepts, or tells Carmen to write them first;
 * `refused` is what she passed that the user did not ask for: a concept, or skip_concepts.
 */
export function conceptGate(
  concepts: Array<FilmConcept>,
  refused: { concept: string; skip: boolean },
): ConceptGate {
  const why = [
    refused.concept
      ? `הקונספט "${refused.concept.slice(0, 80)}" לא נשמר: המשתמש לא בחר אותו. אם המשתמש תיאר קונספט משלו, העבירי ב-concept את המילים שלו בדיוק כמו שכתב. `
      : "",
    refused.skip ? `${skipRefused("concepts")} ` : "",
  ].join("");
  if (concepts.length > 0) {
    return {
      needs_input: true,
      missing: ["concept"],
      say_to_user: `לפני התסריט, איזה קונספט מאשרים?\n${choiceLine(concepts)}`,
      carmen_next: `${why}שלחי למשתמש את say_to_user כמו שהוא ועצרי. ${AFTER_CHOICE}`,
    };
  }
  // say_to_user stays empty: a non-empty one ends the turn before Carmen can write the concepts.
  return {
    needs_input: true,
    missing: ["concept"],
    say_to_user: "",
    carmen_next: `${why}עוד לא כותבים תסריט או סצנות: קודם המשתמש בוחר קונספט. כתבי 2 עד 3 קונספטים שונים באמת לסרט הזה לפי הבריף. לכל אחד: שם קצר, המסר המרכזי, שורת הקריינות או הקופי, והמהלך של הסרט במשפט או שניים. שמרי אותם ב-workshop_save_concepts, הציגי אותם למשתמש בקצרה, וסיימי בשורת בחירה אחת: [[בחירה: ${CONCEPT_LABEL} | <שם 1> | <שם 2> | <שם 3>]]. ואז עצרי: בלי תסריט בתשובה, בלי סצנות ובלי workshop_storyboard עד שהמשתמש בוחר. ${AFTER_CHOICE}`,
  };
}

/** The tap-to-answer question for the latest concepts on the board. */
const choiceLine = (concepts: Array<FilmConcept>) =>
  `[[בחירה: ${CONCEPT_LABEL} | ${[
    ...new Set(concepts.map((concept) => tapTitle(concept.title))),
  ]
    .slice(-4)
    .join(" | ")}]]`;

const AFTER_CHOICE = `כשהמשתמש בחר (בכפתור או במילים, למשל "השני"), קראי שוב ל-workshop_storyboard עם concept (שם הקונספט, או הקונספט שתיאר במילים שלו). concept הוא רק מה שהמשתמש בחר; קונספט שלא בחר לא נשמר. הצעד הבא הוא תסריט לפי הקונספט הזה (המסר, הקריינות והמהלך שלו), והכלי יגיד איך. רק כשהמשתמש נתן תסריט מלא משלו או ביקש במפורש בלי קונספטים: skip_concepts=true.`;
