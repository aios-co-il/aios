/**
 * Keeps Carmen composed in her clips, like a professional marketing manager rather than a fashion
 * model (David, Nov 2026: Carmen's clips looked like a model posing). Only Carmen: a client's
 * film may want its model to pose. An engine with a negative prompt field (Kling direct,
 * Higgsfield) gets the fashion and morphing failures there; every engine, including OpenRouter
 * (Kling 3, Veo, Seedance), which has no such field, gets them as a positive continuity lock in
 * the prompt. Shape after DirectorSKILL (MIT, https://github.com/wuwangzhang1216/DirectorSKILL,
 * references/ai-video-tool-adapters.md): exclusions go to the negative field when it exists,
 * otherwise they become positive facts.
 * Carmen's own rules: supabase/functions/_shared/workshop/motion-direction.ts.
 */

/** What every clip excludes: image models garble Hebrew (textless-motion.ts). */
export const TEXT_NEGATIVE = "text, letters, captions, logo, watermark";

/** What a clip of Carmen excludes on top. */
export const CARMEN_NEGATIVE =
  "fashion pose, hair flip, spinning, turning around, runway walk, morphing face, deformed hands";

/** The same exclusions as positive facts, for a prompt (engines without a negative field). */
export const CARMEN_LOCK =
  "The person stays composed and professional and moves only as described; face, outfit and hair stay unchanged.";

/**
 * Carmen by name, in English or Hebrew. Keep in step with CARMEN in
 * supabase/functions/_shared/workshop/motion-direction.ts (the worker imports nothing from there).
 */
const CARMEN = /\bcarmen\b|כרמן/i;

/**
 * One of Carmen's skin portraits (built-in /brand/carmen/, a tenant's agent-avatars image, or an
 * asset named after her). Keep in step with CARMEN_PICTURE in motion-direction.ts.
 */
const CARMEN_PICTURE = /carmen|כרמן|\/agent-avatars\//i;

/** What the clip job knows about a scene: its texts and its meta. */
export interface ClipScene {
  visual_prompt?: string | null;
  motion?: string;
  meta?: {
    speaker?: unknown;
    reference_url?: unknown;
    skin_switch?: unknown;
  } | null;
}

/**
 * Whether the clip shows Carmen: her name in the picture description, the motion (as the engine
 * gets it, after textlessMotion) or the speaker, her skin portrait as the scene's reference, or a
 * skin switch (a cut between her skins).
 */
export function showsCarmen({ visual_prompt, motion, meta }: ClipScene) {
  return (
    meta?.skin_switch === true ||
    CARMEN.test(
      `${visual_prompt ?? ""} ${motion ?? ""} ${String(meta?.speaker ?? "")}`,
    ) ||
    CARMEN_PICTURE.test(String(meta?.reference_url ?? ""))
  );
}

/** The negative prompt for a clip, with Carmen's exclusions when it shows her. */
export const clipNegativePrompt = (carmen: boolean) =>
  carmen ? `${TEXT_NEGATIVE}, ${CARMEN_NEGATIVE}` : TEXT_NEGATIVE;
