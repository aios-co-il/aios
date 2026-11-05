/**
 * workshop_save_pronunciation: how a word is said in the tenant's films, for every project of the
 * workshop (workshop_pronunciations). The render worker puts the spoken form in place of the word
 * in the text the voice engine hears, ahead of Dicta's nikud (render-worker jobs/pronunciations.ts).
 * A spoken form is one word, so the take's word timings still line up with the script's words.
 */

import { type ToolContext } from "../tool-context.ts";

const MAX_ENTRIES = 10;
const MAX_WORD = 40;
const MAX_SPOKEN = 60;
/** Nikud, cantillation and the shin/sin dots; maqaf stays (it joins two words into one). */
const POINTS = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;
/** Punctuation around a word: anything that is not a letter, digit, point, maqaf or geresh. */
const EDGES =
  /^[^\p{L}\p{N}\u0591-\u05C7\u05F3']+|[^\p{L}\p{N}\u0591-\u05C7\u05F3']+$/gu;

export const PRONUNCIATION_TOOL = {
  name: "workshop_save_pronunciation",
  description:
    'שומרת איך אומרים מילה בקריינות, לכל הסדנה: חל על כל הפרויקטים והסרטים הבאים של הארגון, לא רק על הפרויקט הזה. כשהמשתמש אומר שמילה נשמעת לא נכון ("מכירות נשמע מחירות"): word המילה כפי שכתובה בתסריט, spoken מילה אחת בניקוד מלא (מְכִירוֹת) או בכתיב שנשמע נכון. מילה שכבר נשמרה מתעדכנת. אחר כך קראי ל-workshop_produce_video כדי להקליט את הקריינות מחדש. לא עולה כסף.',
  parameters: {
    type: "object",
    properties: {
      pronunciations: {
        type: "array",
        description: "עד 10 מילים.",
        items: {
          type: "object",
          properties: {
            word: {
              type: "string",
              description: "המילה כפי שכתובה בתסריט, מילה אחת בלי ניקוד.",
            },
            spoken: {
              type: "string",
              description:
                "איך הקריין אומר אותה: מילה אחת (בלי רווחים), בניקוד מלא או בכתיב פונטי.",
            },
          },
          required: ["word", "spoken"],
        },
      },
    },
    required: ["pronunciations"],
  },
};

type Entry = { word: string; spoken: string };

/** Saves the pronunciations for the caller's tenant; an entry that cannot be used refuses the call. */
export async function workshopSavePronunciation(ctx: ToolContext) {
  const parsed = parseEntries(ctx.args.pronunciations);
  if ("error" in parsed) {
    return parsed;
  }
  const { error } = await ctx.supabase.from("workshop_pronunciations").upsert(
    parsed.entries.map((entry) => ({ tenant_id: ctx.tenantId, ...entry })),
    { onConflict: "tenant_id,word" },
  );
  if (error) {
    console.error("[workshop] pronunciations not saved", error.message);
    return { error: `שמירת ההגייה נכשלה: ${error.message}` };
  }
  const said = parsed.entries
    .map((entry) => `${entry.word} ← ${entry.spoken}`)
    .join(", ");
  return {
    success: true,
    saved: parsed.entries,
    message: `ההגייה נשמרה לכל הסדנה: ${said}. היא תחול בכל הקריינויות מעכשיו, בכל הפרויקטים.`,
    carmen_next:
      "אמרי למשתמש שההגייה נשמרה לכל הסדנה ותיזכר בכל הסרטים הבאים. אם הפרויקט הזה מחכה לאישור הקריינות, קראי עכשיו ל-workshop_produce_video: הקריינות מוקלטת מחדש עם ההגייה ומוצגת שוב לאישור.",
  };
}

/** The entries as stored (the word plain, the spoken form one word), or why one cannot be used. */
function parseEntries(
  value: unknown,
): { entries: Array<Entry> } | { error: string } {
  const list = Array.isArray(value) ? value.slice(0, MAX_ENTRIES) : [];
  const byWord = new Map<string, Entry>();
  for (const raw of list) {
    const record = raw && typeof raw === "object" ? (raw as Entry) : null;
    const word = plainWord(String(record?.word ?? ""));
    const spoken = String(record?.spoken ?? "")
      .normalize("NFC")
      .trim();
    if (!word || !/\p{L}/u.test(word) || /\s/.test(word)) {
      return { error: `word צריכה להיות מילה אחת: "${record?.word ?? ""}"` };
    }
    if (!spoken || /\s/.test(spoken) || !/\p{L}/u.test(spoken)) {
      return {
        error: `spoken צריכה להיות מילה אחת בלי רווחים (בניקוד או בכתיב פונטי): "${record?.spoken ?? ""}"`,
      };
    }
    if (word.length > MAX_WORD || spoken.length > MAX_SPOKEN) {
      return { error: `המילה ארוכה מדי: "${word}"` };
    }
    byWord.set(word, { word, spoken });
  }
  if (byWord.size === 0) {
    return { error: "pronunciations ריק: לכל מילה word ו-spoken." };
  }
  return { entries: [...byWord.values()] };
}

/**
 * The word as the worker matches it: without nikud or the punctuation around it. Change together
 * with render-worker/src/jobs/pronunciations.ts (plainWord, PREFIXES, EDGE) and
 * workshop_narration_take (migration 20261105170000_workshop_narration_review), which match the
 * stored word in a script the same way.
 */
export const plainWord = (text: string) =>
  text.normalize("NFC").replace(POINTS, "").trim().replace(EDGES, "");
