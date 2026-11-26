/**
 * What the panel's card says for each device step. The panel draws the card itself (plan
 * rule 6), so every address on it comes from Chrome's tab or from the claimed row, never
 * from the framed site. Hosts are punycode, as Chrome's own prompt shows them.
 */

/** The card's lines: its title, its explanation and the allow button. */
export type CardWords = { title: string; text: string; allow: string };

/** The card before Carmen reads a site for the first time in this panel. */
export function readCardWords(host: string): CardWords {
  return {
    title: `כרמן מבקשת לקרוא את הדף באתר ${host}`,
    text: 'כרמן תקרא את הכותרת, את הטקסט ואת שמות הכפתורים, הקישורים והשדות שמוצגים בדף, בלי מה שמוקלד בשדות. Chrome יבקש לאשר לתוסף "לקרוא ולשנות" את האתר הזה; כרמן רק קוראת, וההרשאה תוסר כשהחלונית תיפתח מחדש.',
    allow: "לאפשר קריאה",
  };
}

/**
 * The card before every navigation: the destination's host in the title, and the full
 * address in the text. The address is isolated left to right, so right-to-left characters
 * in it cannot reorder what the user reads.
 */
export function navigateCardWords(step: {
  fromHost: string;
  host: string;
  href: string;
}): CardWords {
  return {
    title: `כרמן מבקשת לעבור לאתר ${step.host}`,
    text: `הלשונית שפתוחה עכשיו ב-${step.fromHost} תעבור לכתובת ⁦${step.href}⁩. אחרי המעבר כרמן תדע רק את הכתובת ואת הכותרת של הדף החדש; כדי לקרוא אותו היא תבקש בנפרד.`,
    allow: "לעבור לאתר",
  };
}
