/**
 * The Hebrew ElevenLabs voices Carmen offers for narration. The user picks one after hearing a
 * short sample on the board; the choice is kept on the project (payload.video.voice_id).
 */

export interface Voice {
  id: string;
  name: string;
  english: string;
  gender: "female" | "male";
  character: string;
  fits: string;
}

export const HEBREW_VOICES: Voice[] = [
  {
    id: "d4eLZ8u5dfBCsjp4YPyz",
    name: "יעל",
    english: "Yael",
    gender: "female",
    character: "רך, בטוח, קצב רגוע",
    fits: "פרסומות ומיתוג",
  },
  {
    id: "p7J75VowGmxi3K0it9lN",
    name: "תמר",
    english: "Tamar",
    gender: "female",
    character: "רך ומרגיע",
    fits: "פרסומות",
  },
  {
    id: "Tbj9UQjXon5RB9MPEyc2",
    name: "זינה",
    english: "Zina",
    gender: "female",
    character: "צעירה, חמה, רגשית",
    fits: "סיפורים, דמויות ותוכן רגשי",
  },
  {
    id: "ZiofZHcEBTn5sRySe5h8",
    name: "נמרוד",
    english: "Nimrod",
    gender: "male",
    character: "חם, בטוח, ישראלי מאוד",
    fits: "פרסומות, רשתות חברתיות ופודקאסטים",
  },
  {
    id: "l7Q9rbdCC6j3J5dNlOOg",
    name: "איתמר",
    english: "Itamar",
    gender: "male",
    character: "ברור, שיחתי, קצב מדוד",
    fits: "סרטוני הסבר, קורסים והדרכות",
  },
  {
    id: "6Ijsl5024dyMrE00loVE",
    name: "הרצל",
    english: "Herzl",
    gender: "male",
    character: "רגוע, רהוט, הגייה מדויקת",
    fits: "הרצאות, תוכן חינוכי ותיעודי",
  },
  {
    id: "PBHwEnXdzx0yfhIO2UCH",
    name: "דוריאן",
    english: "Dorian",
    gender: "male",
    character: "צעיר, אקספרסיבי, כמו חבר",
    fits: "תוכן שיווקי קליל וסיפורים",
  },
  {
    id: "8sZ9Z3Jy28CGLLCmKEHn",
    name: "ויקטור",
    english: "Viktor",
    gender: "male",
    character: "חביב וחכם",
    fits: "תוכן כללי",
  },
];

/** What each voice reads for its sample. */
export const sampleText = (voice: Voice) =>
  voice.gender === "female"
    ? `היי, אני ${voice.name}. ככה אני נשמעת כשאני מקריינת את הסרטון שלכם.`
    : `היי, אני ${voice.name}. ככה אני נשמע כשאני מקריין את הסרטון שלכם.`;

/** A voice by id, Hebrew name, English name, or a tap like "יעל (רך, בטוח)". */
export function findVoice(value: unknown): Voice | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  return (
    HEBREW_VOICES.find((voice) => voice.id === text) ??
    HEBREW_VOICES.find(
      (voice) =>
        text.startsWith(voice.name) ||
        text.toLowerCase().startsWith(voice.english.toLowerCase()),
    ) ??
    null
  );
}

/** The message with every voice and a button row per gender. */
export function voiceMenu(
  gender?: "female" | "male",
  only?: Set<string>,
): string {
  const voices = HEBREW_VOICES.filter(
    (voice) =>
      (!gender || voice.gender === gender) && (!only || only.has(voice.id)),
  );
  const lines = voices.map(
    (voice) => `• ${voice.name}: ${voice.character}. מתאים ל${voice.fits}.`,
  );
  const row = (label: string, list: Voice[]) =>
    list.length > 0
      ? [`[[בחירה: ${label} | ${list.map((v) => v.name).join(" | ")}]]`]
      : [];
  return [
    "בחרו קול לקריינות. דוגמה של כל קול מחכה בלוח, אפשר להאזין לפני שבוחרים:",
    ...lines,
    ...row(
      "קריינית",
      voices.filter((v) => v.gender === "female"),
    ),
    ...row(
      "קריין",
      voices.filter((v) => v.gender === "male"),
    ),
  ].join("\n");
}
