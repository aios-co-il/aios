import type { PersonaProfile } from "./personas.ts";

/**
 * The prompt section that makes the assistant this character for the caller:
 * its name, how it introduces itself, and its personality, soul and writing
 * style. Mood is applied separately (`agentMoodPrompt`).
 */
export function personaPromptSection(persona: PersonaProfile): string {
  const lines = [
    `🎭 **הדמות שלך מול המשתמש הזה:** המשתמש בחר לעבוד איתך כ"${persona.displayName}". מולו שמך ${persona.displayName}, וכך את מציגה ומזכירה את עצמך (גם כשהפרומפט קורא לך בשם אחר). היכולות, ההרשאות וכללי האישור שלך לא משתנים.`,
  ];
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

const WRITING_STYLES: Record<string, string> = {
  formal: "רשמי",
  casual: "חברותי",
  professional: "מקצועי",
  playful: "משחקי",
};
