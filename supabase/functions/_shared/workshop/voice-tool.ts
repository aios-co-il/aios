/**
 * workshop_choose_voice: the narration voice for a film. Without a voice it lays a short sample of
 * every Hebrew voice on the board and asks the user to pick; with one it saves the choice.
 */

import { findVoice, HEBREW_VOICES, voiceMenu } from "./voices.ts";

export const VOICE_TOOL = {
  name: "workshop_choose_voice",
  description:
    "בחירת קול לקריינות של הסרט. בלי voice: מניחה בלוח דוגמה מוקלטת לכל קול עברי ומחזירה say_to_user עם רשימה וכפתורים. שלחי את say_to_user כמו שהוא ועצרי. כשהמשתמש בחר: קראי שוב עם voice (שם או מזהה). לפני קריינות תמיד בוחרים קול. לא עולה כסף.",
  parameters: {
    type: "object",
    properties: {
      item_id: { type: "string" },
      voice: {
        type: "string",
        description: "הקול שהמשתמש בחר: שם (יעל, נמרוד) או מזהה.",
      },
      gender: {
        type: "string",
        enum: ["female", "male"],
        description: "רק קריינית או רק קריין, אם המשתמש כבר אמר.",
      },
    },
    required: ["item_id"],
  },
};

export interface VoiceHelpers {
  /** Makes (or finds) the sample for a voice; returns its storage path. */
  voiceSample?: (voiceId: string) => Promise<{ path?: string; error?: string }>;
  /** Puts a page with the sample on the board. */
  addSamplePage: (
    title: string,
    path: string,
    voiceId: string,
  ) => Promise<void>;
  /** Saves the chosen voice on the project. */
  saveVoice: (voiceId: string, name: string) => Promise<void>;
}

export async function chooseVoice(
  args: Record<string, unknown>,
  helpers: VoiceHelpers,
) {
  const picked = findVoice(args.voice);
  if (picked) {
    await helpers.saveVoice(picked.id, picked.name);
    return {
      success: true,
      voice_id: picked.id,
      voice: picked.name,
      message: `הקול נשמר: ${picked.name}. הקריינות של הסרט תהיה בקול הזה.`,
    };
  }
  const gender =
    args.gender === "female" || args.gender === "male"
      ? args.gender
      : undefined;
  const voices = HEBREW_VOICES.filter((v) => !gender || v.gender === gender);
  const missing: string[] = [];
  const heard = new Set<string>();
  for (const voice of voices) {
    const sample = helpers.voiceSample
      ? await helpers.voiceSample(voice.id)
      : { error: "no samples" };
    if (sample.path) heard.add(voice.id);
    if (sample.path)
      await helpers.addSamplePage(
        `קול: ${voice.name} · ${voice.character}`,
        sample.path,
        voice.id,
      );
    else missing.push(voice.name);
  }
  return {
    needs_input: true,
    missing: ["voice"],
    // A voice the key cannot sample would not narrate either: offer only the ones heard.
    say_to_user: voiceMenu(gender, heard.size > 0 ? heard : undefined),
    ...(missing.length > 0 ? { samples_missing: missing } : {}),
    carmen_next:
      "שלחי את say_to_user כמו שהוא ועצרי. כשהמשתמש בוחר, קראי שוב ל-workshop_choose_voice עם voice." +
      (missing.length > 0
        ? " לחלק מהקולות לא נוצרה דוגמה (חסר מפתח ElevenLabs או שהקול לא זמין): אמרי את זה במשפט אחד."
        : ""),
  };
}
