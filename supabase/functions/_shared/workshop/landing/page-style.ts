/** The visual style of a landing page: the landing-pages app's theme, plus Carmen's direction. */
import { plainShownText } from "./kind.ts";

export interface LandingStyle {
  primaryColor: string;
  /** Two to five brand colours for the stripe under the header and above section titles. */
  accents?: Array<string>;
  /** "dark" sets the hero and the closing form on deep navy, for a white logo. */
  hero: "light" | "dark";
  /** The direction in words: mood, typography feel, what the references show. */
  direction: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Validates a style; problems are in Hebrew, for Carmen to act on. */
export function parseLandingStyle(raw: Record<string, unknown>): {
  style: LandingStyle | null;
  problems: Array<string>;
} {
  const problems: Array<string> = [];
  const primaryColor =
    typeof raw.primary_color === "string" ? raw.primary_color.trim() : "";
  if (!HEX.test(primaryColor)) {
    problems.push("primary_color חייב להיות צבע בפורמט #RRGGBB");
  }
  const hero =
    raw.hero === "dark" ? "dark" : raw.hero === "light" ? "light" : null;
  if (!hero) {
    problems.push('hero חייב להיות "light" או "dark"');
  }
  const direction =
    typeof raw.direction === "string" ? raw.direction.trim() : "";
  if (!direction) {
    problems.push("חסר direction: תיאור הכיוון העיצובי במילים, כטקסט");
  }
  if (direction.length > 1500) {
    problems.push("direction ארוך מ-1500 תווים");
  }
  const accents = readAccents(raw.accents, problems);
  if (problems.length > 0 || !hero) {
    return { style: null, problems };
  }
  return {
    style: {
      primaryColor,
      ...(accents.length > 0 ? { accents } : {}),
      hero,
      direction,
    },
    problems,
  };
}

/** The brand colours: none, or two to five hex colours; anything else is reported. */
function readAccents(raw: unknown, problems: Array<string>): Array<string> {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    problems.push("accents חייב להיות רשימת צבעים");
    return [];
  }
  const colours = raw.filter(
    (colour): colour is string =>
      typeof colour === "string" && HEX.test(colour),
  );
  if (colours.length !== raw.length) {
    problems.push("accents: כל צבע בפורמט #RRGGBB");
  }
  if (raw.length === 1 || raw.length > 5) {
    problems.push("accents: בין 2 ל-5 צבעים, או בלי בכלל");
  }
  return colours;
}

/** The style as readable text for the board. */
export function landingStyleText(style: LandingStyle): string {
  return plainShownText(
    [
      style.direction,
      `צבע ראשי: ${style.primaryColor}`,
      style.accents ? `צבעי מותג: ${style.accents.join(" · ")}` : "",
      `אזור הפתיחה: ${style.hero === "dark" ? "כהה (ללוגו בהיר)" : "בהיר"}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
