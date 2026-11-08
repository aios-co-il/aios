/**
 * Words that mark a standing instruction ("תזכרי", "מעכשיו", "always"). Such a message is saved
 * to memory before the model runs, and it skips the chat's fast lane.
 */
export const INSTRUCTION_TRIGGER_RE =
  /(תזכרי|זכרי|תזכור|שמרי|תרשמי|מעכשיו|מהיום והלאה|תמיד|לעולם|אל\s*תעני|אל\s*תעשי|אל\s*תכתבי|אל\s*תשכחי|שימי\s*לב|תכניסי\s*לזיכרון|הוסיפי\s*לזיכרון|גם\s*בזיכרון|תזכרי\s*גם|remember|from\s*now\s*on|always|never|note\s*that|learn\s*this)/i;
