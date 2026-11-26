/**
 * What the panel's card says for each device step. The panel draws the card itself (plan
 * rule 6), so every address on it comes from Chrome's tab or from the claimed row, never
 * from the framed site. Hosts are punycode, as Chrome's own prompt shows them.
 */
import { INVISIBLE_FORMAT } from "../../../supabase/functions/_shared/carmen/device/typed-text.ts";

/**
 * The card's lines: its title, the address it is about (shown left to right on a line of
 * its own, or null), the text to be typed (in its own direction on lines of its own, or
 * null), its explanation, the allow button, and the label of the "trust this site"
 * checkbox (null hides it: only a click or typing card that asks offers it).
 */
export type CardWords = {
  title: string;
  address: string | null;
  quote: string | null;
  text: string;
  allow: string;
  trust: string | null;
};

/** The element a click or type card is about, as the acting function found it now. */
export type CardTarget = {
  /** The tab's host, punycode, from Chrome's address. */
  host: string;
  role: string;
  name: string;
};

/** The card before Carmen reads a site for the first time in this panel. */
export function readCardWords(host: string): CardWords {
  return {
    title: `כרמן מבקשת לקרוא את הדף באתר ${host}`,
    address: null,
    quote: null,
    text: 'כרמן תקרא את הכותרת, את הטקסט ואת שמות הכפתורים, הקישורים והשדות שמוצגים בדף, בלי מה שמוקלד בשדות. Chrome יבקש לאשר לתוסף "לקרוא ולשנות" את האתר הזה; כרמן רק קוראת, וההרשאה תוסר כשהחלונית תיפתח מחדש.',
    allow: "לאפשר קריאה",
    trust: null,
  };
}

/**
 * The card before every navigation: the destination's host in the title, and the full
 * address on its own left-to-right line, so right-to-left text around it cannot reorder or
 * split what the user approves.
 */
export function navigateCardWords(step: {
  fromHost: string;
  host: string;
  href: string;
}): CardWords {
  return {
    title: `כרמן מבקשת לעבור לאתר ${step.host}`,
    address: step.href,
    quote: null,
    text: `הלשונית שפתוחה עכשיו ב-${step.fromHost} תעבור לכתובת הזו. אחרי המעבר כרמן תדע רק את הכתובת ואת הכותרת של הדף החדש; כדי לקרוא אותו היא תבקש בנפרד.`,
    allow: "לעבור לאתר",
    trust: null,
  };
}

/**
 * The card before every click: the element's visible name and the site in the title, and
 * where the click leads (a link's address, a form's) on a line of its own when the page
 * says.
 */
export function clickCardWords(
  target: CardTarget & { destination: string | null },
): CardWords {
  return {
    title: `כרמן מבקשת ללחוץ על ${elementLabel(target)} באתר ${target.host}`,
    address: target.destination,
    quote: null,
    text: target.destination
      ? "הלחיצה תיעשה בלשונית שפתוחה עכשיו, והאתר אומר שהיא מובילה לכתובת הזו. אחרי הלחיצה כרמן תדע רק את הכתובת, את הכותרת והאם הדף השתנה."
      : "הלחיצה תיעשה בלשונית שפתוחה עכשיו. אחרי הלחיצה כרמן תדע רק את הכתובת, את הכותרת והאם הדף השתנה.",
    allow: "ללחוץ",
    trust: null,
  };
}

/**
 * The card before every typing step: the field's visible name and the site in the title,
 * and every character to be typed on lines of their own.
 */
export function typeCardWords(
  target: CardTarget & { text: string },
): CardWords {
  return {
    title: `כרמן מבקשת להקליד בשדה ${elementLabel(target)} באתר ${target.host}`,
    address: null,
    quote: target.text,
    text: "זה הטקסט המלא שיוקלד. הוא יחליף את מה שכתוב עכשיו בשדה. כרמן לא רואה מה כתוב בשדות.",
    allow: "להקליד",
    trust: null,
  };
}

/**
 * The card before every picture of the tab: what the picture will show and that it goes to
 * the AI model. On a sensitive page (the act floor, or a password or payment field) it says
 * so first. The tap asks Chrome for the grant a capture needs, which Chrome words for every
 * site, so the card says the extension gives it back right after the picture.
 */
export function screenshotCardWords(step: {
  host: string;
  sensitive: boolean;
}): CardWords {
  const warning = step.sensitive
    ? "זה דף רגיש: אתר דואר, הודעות, בנק או תשלומים, או דף עם שדה סיסמה או תשלום. "
    : "";
  return {
    title: `כרמן מבקשת לצלם את הלשונית באתר ${step.host}`,
    address: null,
    quote: null,
    text: `${warning}התמונה תראה את כל מה שגלוי עכשיו בלשונית, כולל שמות, מספרים והודעות שמוצגים בה, ותישלח למודל ה-AI שעונה לך כדי שיקרא אותה. הקובץ נמחק מהשרת מיד אחרי הקריאה. כדי לצלם, Chrome יבקש לאשר לתוסף "לקרוא ולשנות" את כל האתרים; התוסף מוותר על ההרשאה הזו מיד אחרי הצילום.`,
    allow: "לצלם",
    trust: null,
  };
}

/**
 * The label of the checkbox that trusts one exact origin for the conversation. It names
 * the host with its port, as the trust is kept, and says what the trust never covers.
 */
export function trustWords(origin: string): string {
  return `לסמוך על \u2068${new URL(origin).host}\u2069 בשיחה הזו: הלחיצות וההקלדות הבאות באתר הזה יתבצעו בלי לשאול, כל עוד כרמן קוראת רק אותו. מעבר לאתר אחר ודפים עם שדה סיסמה או תשלום ימשיכו לשאול.`;
}

/**
 * The element as the card names it: its visible name in quotes, isolated from the Hebrew
 * around it with its own direction and stripped of invisible format characters (direction
 * controls among them); its role, the same way, when the page gave it no name.
 */
function elementLabel(target: CardTarget): string {
  const name = target.name.replace(INVISIBLE_FORMAT, "").trim();
  const role = target.role.replace(INVISIBLE_FORMAT, "").trim();

  return name ? `"\u2068${name}\u2069"` : `(\u2068${role}\u2069 ללא שם)`;
}
