/**
 * How Carmen directs a scene's motion for image-to-video (Kling 3 via OpenRouter and the other
 * clip engines): a marketing manager who acts for the message, not a model who poses (David,
 * Nov 2026). The full guide goes into the storyboard's motion_prompt field, the summary into the
 * other motion fields; workshop_storyboard and workshop_update_scene refuse a Carmen scene whose
 * motion asks for fashion posing (a client's film is not judged).
 *
 * Adapted, not copied, from open-source director guides:
 * - DirectorSKILL (MIT, (c) 2026 wangzhang-wu), https://github.com/wuwangzhang1216/DirectorSKILL:
 *   references/ai-video-tool-adapters.md (motion-only prompt shape, named end pose, Kling),
 *   references/blocking-and-staging.md (motivated movement, what AI video renders reliably),
 *   references/genre-playbooks.md (commercial and 9:16 social).
 * - Autoverse AI Agent Skills, skills/ai-video-prompting (Apache-2.0, HsinPu),
 *   https://github.com/HsinPu/Autoverse-Ai-Agent-Skills (one action per clip, no new props).
 * - kling-ai-prompt-generator (MIT, maciejdzierzek),
 *   https://github.com/maciejdzierzek/kling-ai-prompt-generator (first/then/finally, settle).
 */

import { motionField } from "./motion-text.ts";
import { asRecord } from "./record.ts";

/** The director's rules for one scene's motion, in English like the prompt itself. */
export const MOTION_DIRECTION_GUIDE = [
  "MOTION DIRECTION (motion serves the message; anyone on screen acts for their role. Carmen herself is a professional marketing manager, never a fashion model: rules 4 and 5 are hers):",
  "1. The beat decides the action: first name the one thing the viewer must understand from this scene (its approved script beat: narration, on-screen text, visual). Carmen's action shows that one thing; if no action shows it, she holds still and only the camera or one small detail moves.",
  "2. One mover, one verb, one direction, 2-5 s; everything else holds. Motion-only: the still already fixes face, outfit, set and light, so describe change, not appearance.",
  '3. Order, short present-tense sentences, 30-60 words: camera -> start state -> one action with pace -> optional one small environmental motion -> named end pose -> continuity lock. Always end on a named end pose ("ends looking into the lens, hand resting on the desk"); a longer clip: first / then / finally.',
  "4. Professional actions: presents a dashboard on the laptop, points at or taps a chart, turns the laptop toward the viewer, types then looks up, nods while listening, leans in to a screen, slides a document forward, a small open-palm gesture while explaining. Match the skin: copywriter types or reads her draft; analyst points at the numbers; designer drags a colour swatch on screen; campaigner adjusts a campaign on screen; producer reviews a shot on a monitor.",
  "5. Body language: calm, confident, stillness is authority. Head turns of 45 degrees or less, at most one step. Never runway or fashion posing, hair flips, spins, twirls, walking toward the camera, or holding a product beside her face.",
  "6. Eye line: on the screen or product while presenting; into the lens only when she addresses the viewer (hook, call to action).",
  "7. Camera with a reason, one move per shot: slow push-in for an insight or proof; pull-back or pan to reveal the solution; locked-off for an explanation. In 9:16 move toward the subject or not at all.",
  "8. Avoid moves that morph: turns of 90 degrees or more, spins, handing objects over, stairs, fine finger work, entering the frame, two people moving together.",
  "9. Continuity lock: same outfit, hair, set and light as the still; no new props, people or text.",
  'Hook. Wrong: "She strikes a confident pose and flips her hair." Right: "Locked-off medium shot. Carmen sits at her desk, eyes on the laptop. She looks up into the lens and gives one small nod. Ends looking into the lens, hands resting on the desk. Outfit, hair and office stay unchanged."',
  'Insight. Wrong: "She spins around showing the results." Right: "Slow push-in. Carmen faces the laptop. She points at the rising line on the chart and holds. Ends with her finger on the chart, eyes on the screen. Nothing else moves."',
  'Call to action. Wrong: "She walks toward the camera like a model." Right: "Static camera. Carmen turns the laptop toward the viewer, then looks into the lens with a small open-palm gesture. Ends still, laptop facing the lens. Her outfit and the set stay unchanged."',
].join("\n");

/** The guide in one Hebrew line, for the other motion fields and tool descriptions. */
export const MOTION_DIRECTION_SUMMARY =
  "תנועה (motion_prompt): קודם מה הצופה צריך להבין מהשורה בתסריט, ואז פעולה אחת עם סיבה שמראה את זה (או שהדמות נשארת בשקט), מצלמה עם סיבה, ותנוחת סיום עם שם. כרמן זזה כמו מנהלת שיווק מקצועית, לא כמו דוגמנית. הכללים המלאים בתיאור motion_prompt של workshop_storyboard.";

/** The storyboard's motion field: its own words, the full director's guide and the no-text rule. */
export const directedMotionField = (description: string) =>
  motionField(`${description}\n${MOTION_DIRECTION_GUIDE}`);

/**
 * Any other motion field: its own words, the guide's summary and the no-text rule. The full guide
 * goes in once (workshop_storyboard), so every request does not carry it three times.
 */
export const summaryMotionField = (description: string) =>
  motionField(`${description}\n${MOTION_DIRECTION_SUMMARY}`);

/**
 * Fashion phrasing a professional's motion never asks for. Bare "pose" stays allowed: the guide
 * asks for a named end pose ("holds the pose", "ends in a relaxed pose"), and "spins" alone is a
 * product's move ("the watch face spins").
 */
const FASHION_MOTION =
  /\b(?:strikes?\s+(?:a\s+)?pose|pos(?:es|ing)\s+(?:for|to|toward)\s+(?:the\s+)?camera|posing|hair\s+flips?|flips?\s+(?:her|his)\s+hair|toss(?:es)?\s+(?:her|his)\s+hair|twirl(?:s|ing|ed)?|spins?\s+around|spinning|runway|catwalk|model\s+walk|walks?\s+towards?\s+the\s+camera|turns?\s+around)\b/i;

/**
 * Carmen by name, in English or Hebrew. Keep in step with CARMEN in
 * render-worker/src/providers/composed-motion.ts (the worker imports nothing from here).
 */
const CARMEN = /\bcarmen\b|כרמן/i;

/**
 * One of Carmen's skin portraits: the built-in ones under /brand/carmen/ (skin-gallery.ts), a
 * tenant's own skin image in its agent-avatars folder, or a project asset named after her. Keep in
 * step with CARMEN_PICTURE in render-worker/src/providers/composed-motion.ts.
 */
const CARMEN_PICTURE = /carmen|כרמן|\/agent-avatars\//i;

/** A scene as Carmen passes it or as it is stored (talking fields and reference from meta). */
export interface DirectedScene {
  visual_prompt?: unknown;
  motion_prompt?: unknown;
  speaker?: unknown;
  reference_url?: unknown;
  skin_switch?: unknown;
}

/**
 * Whether the scene shows Carmen, the one whose motion must never look like a model's (David,
 * Nov 2026). A client's film (a fashion brand's model posing in a dress) is not judged: posing
 * is that film's job. A skin switch is a cut between Carmen's skins (edit-tool.ts).
 */
export function isCarmenScene(scene: DirectedScene): boolean {
  return (
    scene.skin_switch === true ||
    CARMEN.test(
      `${String(scene.visual_prompt ?? "")} ${String(scene.motion_prompt ?? "")} ${String(scene.speaker ?? "")}`,
    ) ||
    CARMEN_PICTURE.test(String(scene.reference_url ?? ""))
  );
}

/** The fashion phrase in a Carmen scene's motion, or null when the motion is professional. */
export function fashionMotion(scene: DirectedScene): string | null {
  const found = String(scene.motion_prompt ?? "").match(FASHION_MOTION)?.[0];
  return found && isCarmenScene(scene) ? found : null;
}

/** Why a Carmen scene's motion is refused, in Carmen's words; `number` is the scene's position. */
export const fashionMotionRefusal = (number: number, word: string) =>
  `סצנה ${number}: ה-motion_prompt מבקש תנועה של דוגמנית ("${word}"). כתבי אותו מחדש לפי כללי התנועה בתיאור של motion_prompt: פעולה מקצועית אחת שמראה את מה שהשורה בתסריט אומרת, מצלמה עם סיבה, ותנוחת סיום עם שם.`;

/** The first Carmen scene whose motion asks for posing, as a refusal, or null. */
export function directedMotionRefusal(
  scenes: Array<DirectedScene>,
): { error: string } | null {
  for (const [index, scene] of scenes.entries()) {
    const word = fashionMotion(scene);
    if (word) {
      return { error: fashionMotionRefusal(index + 1, word) };
    }
  }
  return null;
}

/** The fields of workshop_update_scene that can make a scene's motion a model's. */
const DIRECTED_FIELDS = [
  "motion_prompt",
  "visual_prompt",
  "speaker",
  "skin_switch",
] as const;

/**
 * workshop_update_scene: the refusal for a change that leaves a Carmen scene posing, judged on the
 * scene as it would be (a new picture description can make the motion it already has Carmen's).
 */
export function changedMotionRefusal(
  scene: {
    position?: number;
    visual_prompt?: unknown;
    motion_prompt?: unknown;
    meta?: unknown;
  },
  args: Record<string, unknown>,
): { error: string } | null {
  if (!DIRECTED_FIELDS.some((key) => args[key] != null)) {
    return null;
  }
  const meta = asRecord(scene.meta);
  const word = fashionMotion({
    visual_prompt: args.visual_prompt ?? scene.visual_prompt,
    motion_prompt: args.motion_prompt ?? scene.motion_prompt,
    speaker: args.speaker ?? meta.speaker,
    skin_switch: args.skin_switch ?? meta.skin_switch,
    reference_url: meta.reference_url,
  });
  return word
    ? { error: fashionMotionRefusal(scene.position ?? 1, word) }
    : null;
}
