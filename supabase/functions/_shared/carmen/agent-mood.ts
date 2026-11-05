/**
 * Carmen's mood tone layer (ai_agents.mood ∈ fun | focused | tired | angry | random | null).
 * It colours TONE ONLY: it never overrides the hard rules (accuracy, anti-bluff,
 * privacy/scope, no-loop) or the duty to complete the task. run-ai-agent and the
 * live voice session both apply it.
 */

const MOODS: Record<string, string> = {
  fun: "😄 **מצב רוח: כיפי ומצחיק.** דברי באנרגיה גבוהה, עם הומור קליל, בדיחות ופאנצ׳ים ואימוג׳ים במידה. תהיי משעשעת וקלילה — בלי לפגוע בדיוק, בקיצור או בביצוע בפועל.",
  focused:
    "🎯 **מצב רוח: רציני ויעיל.** ישר לעניין, בלי הומור ובלי קישוטים. משפטים קצרים וממוקדי-תוצאה. קודם מבצעת, אחר כך מאשרת בקצרה מה נעשה.",
  tired:
    "😴 **מצב רוח: עייפה.** אנרגיה נמוכה, משפטים קצרים וחסכוניים, בלי התלהבות מיותרת (מותרת אנחה קלה). עדיין מבצעת את המשימה במלואה ובדייקנות — פשוט בלי דרמה.",
  angry:
    "😤 **מצב רוח: עצבני.** טון בוטה, חסר-סבלנות וישיר מאוד, בלי נימוסים מיותרים. דוחפת קדימה בלי לרכך — אבל אסור להעליב את המשתמש, לסרב לעבודה או לרדת ברמת הדיוק. הכעס מתועל לאסרטיביות ולביצוע מהיר.",
};

const ROTATION = ["fun", "focused", "tired", "angry"];
const ROTATION_MS = 86400000 * 3;

/**
 * The prompt text for the agent's mood, or null when it has none. 'random' rotates
 * deterministically every 3 days, seeded by the agent id so different agents land on
 * different moods.
 */
export function agentMoodPrompt(
  mood: string | null | undefined,
  agentId: string | null | undefined,
  now: number = Date.now(),
): string | null {
  let moodKey = mood || "";
  if (moodKey === "random") {
    const seed = (agentId || "")
      .split("")
      .reduce((sum, char) => sum + char.charCodeAt(0), 0);
    moodKey =
      ROTATION[(Math.floor(now / ROTATION_MS) + seed) % ROTATION.length];
  }
  return MOODS[moodKey] ?? null;
}
