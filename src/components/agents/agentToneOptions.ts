/** A mood the assistant can speak in (`ai_agents.mood`, `carmen_personas.mood`). */
export interface MoodOption {
  value: string;
  label: string;
  emoji: string;
  desc: string;
}

/** The moods `_shared/carmen/agent-mood.ts` knows, plus "none" for no mood. */
export const MOOD_OPTIONS: Array<MoodOption> = [
  {
    value: "none",
    label: "ברירת מחדל",
    emoji: "🙂",
    desc: "ללא מצב רוח — האישיות הבסיסית.",
  },
  {
    value: "fun",
    label: "כיפי ומצחיק",
    emoji: "😄",
    desc: "אנרגטית, הומור קליל, בדיחות ואימוג׳ים.",
  },
  {
    value: "focused",
    label: "מקצועי ויעיל",
    emoji: "🎯",
    desc: "זורמת ועניינית, תשובות קצרות, בלי חזרות ובלי הומור.",
  },
  {
    value: "tired",
    label: "עייף ואין כוח",
    emoji: "😴",
    desc: "אנרגיה נמוכה, קצר וחסכוני — עדיין מבצעת הכול.",
  },
  {
    value: "angry",
    label: "כועס",
    emoji: "😤",
    desc: "בוטה, חסר סבלנות וישיר — בלי להעליב או לרדת בדיוק.",
  },
  {
    value: "random",
    label: "רנדומלי",
    emoji: "🎲",
    desc: "מתחלף לבד כל כמה ימים בין כל מצבי הרוח.",
  },
];

/** Writing styles (`ai_agents.writing_style`, `carmen_personas.writing_style`); "none" stores nothing. */
export const WRITING_STYLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "none", label: "ברירת מחדל" },
  { value: "formal", label: "רשמי" },
  { value: "casual", label: "חברותי" },
  { value: "professional", label: "מקצועי" },
  { value: "playful", label: "משחקי" },
];
