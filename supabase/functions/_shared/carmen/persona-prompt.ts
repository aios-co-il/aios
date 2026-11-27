import type { PersonaChooser } from "./persona-runtime.ts";
import type { PersonaSpeaker } from "./persona-speaker.ts";

/**
 * The prompt section that makes the assistant this character for the caller:
 * its name, who chose it, the gender it speaks in, how it introduces itself,
 * and its personality, soul and writing style. Mood is applied separately
 * (`agentMoodPrompt`).
 */
export function personaPromptSection({
  persona,
  chosenBy,
  gender,
}: Pick<PersonaSpeaker, "persona" | "chosenBy" | "gender">): string {
  const name = persona.displayName;
  const lines = [
    `🎭 **הדמות שלך מול המשתמש הזה:** ${CHOSEN_BY[chosenBy]} "${name}". מולו שמך ${name}, וכך את מציגה ומזכירה את עצמך (גם כשהפרומפט קורא לך בשם אחר). היכולות, ההרשאות וכללי האישור שלך לא משתנים.`,
  ];
  if (gender === "male") {
    lines.push(MALE_SELF_LINE);
  }
  if (persona.introLine) {
    lines.push(
      `כשמציגה את עצמך, זה הבסיס (לא נוסח קבוע): "${persona.introLine}"`,
    );
  }
  if (persona.personality) {
    lines.push(`אישיות והתנהגות: ${persona.personality}`);
  }
  if (persona.soul) {
    lines.push(`נשמה / מטרת קיום: ${persona.soul}`);
  }
  if (persona.writingStyle) {
    lines.push(
      `סגנון כתיבה: ${WRITING_STYLES[persona.writingStyle] ?? persona.writingStyle}`,
    );
  }
  return `\n\n${lines.join("\n")}`;
}

/** Who chose the character, in words that hold for a user's pick and for the organization's. */
const CHOSEN_BY: Record<PersonaChooser, string> = {
  user: "הדמות שהמשתמש בחר עבורך היא",
  organization: "הדמות שהארגון בחר עבורך היא",
};

/**
 * The prompt speaks to the assistant in the feminine; a male character is
 * told to speak of himself in the masculine (his voice greeting does too).
 */
const MALE_SELF_LINE =
  'הדמות שלך זכר: דבר על עצמך בלשון זכר ("אני בודק", "אני שומע"), גם כשהפרומפט פונה אלייך בלשון נקבה.';

const WRITING_STYLES: Record<string, string> = {
  formal: "רשמי",
  casual: "חברותי",
  professional: "מקצועי",
  playful: "משחקי",
};
