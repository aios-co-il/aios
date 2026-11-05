/**
 * Keeps a person in a clip composed, like a professional marketing manager rather than a fashion
 * model (David, Nov 2026: Carmen's clips looked like a model posing). An engine with a negative
 * prompt field (Kling direct, Higgsfield) gets the fashion and morphing failures there; every
 * engine, including OpenRouter (Kling 3, Veo, Seedance), which has no such field, gets them as a
 * positive continuity lock in the prompt. Shape after DirectorSKILL (MIT,
 * https://github.com/wuwangzhang1216/DirectorSKILL, references/ai-video-tool-adapters.md):
 * exclusions go to the negative field when it exists, otherwise they become positive facts.
 * Carmen's own rules: supabase/functions/_shared/workshop/motion-direction.ts.
 */

/** What every clip excludes: image models garble Hebrew (textless-motion.ts). */
export const TEXT_NEGATIVE = "text, letters, captions, logo, watermark";

/** What a clip with a person excludes on top. */
export const PERSON_NEGATIVE =
  "fashion pose, hair flip, spinning, turning around, runway walk, morphing face, deformed hands";

/** The same exclusions as positive facts, for a prompt (engines without a negative field). */
export const PERSON_LOCK =
  "The person stays composed and professional and moves only as described; face, outfit and hair stay unchanged.";

/** Words that put a person in the clip; a product or a place may spin freely. Keep in step with
 * PERSON in supabase/functions/_shared/workshop/motion-direction.ts. */
const PERSON =
  /\b(?:she|he|her|his|him|woman|man|girl|boy|person|people|presenter|carmen|character|marketer|manager|model|face|smiles?|nods?)\b/i;

/** Whether the clip shows a person: it talks, or its motion names one. */
export const showsPerson = (
  motionPrompt: string | null | undefined,
  talking = false,
) => talking || PERSON.test(String(motionPrompt ?? ""));

/** The negative prompt for a clip, with the person exclusions when it shows one. */
export const clipNegativePrompt = (person: boolean) =>
  person ? `${TEXT_NEGATIVE}, ${PERSON_NEGATIVE}` : TEXT_NEGATIVE;
