/** The film's sound effects: what each one is asked as, what it costs, and why one is missing. */
import { isPaidPlanError, isRejectedKeyError } from "../providers/plan.mjs";

/** Bumped when the prompts change, so an older film's effects are made again. */
export const SOUND_EFFECTS_VERSION = 1;
/** ElevenLabs bills 40 credits per second of a sound effect with a set duration. */
const CREDITS_PER_SECOND = 40;
/** Planning price of one ElevenLabs credit (paid plans, overage rate). */
const USD_PER_CREDIT = 0.0003;

export const SOUND_EFFECTS = {
  whoosh: {
    text: "Short cinematic trailer whoosh transition: a fast, airy swish that sweeps past and fades, clean and tight, no music, no voice.",
    durationS: 1.2,
    promptInfluence: 0.6,
  },
  impact: {
    text: "Deep low cinematic trailer hit: one sub-bass boom with a soft rumbling tail, restrained, no music, no voice.",
    durationS: 2.5,
    promptInfluence: 0.6,
  },
};

export const SOUND_EFFECT_NAMES = Object.keys(SOUND_EFFECTS);

/** What ElevenLabs charges for these effects, in USD. */
export const soundEffectsCostUsd = (names) =>
  Math.round(
    names.reduce(
      (sum, name) =>
        sum +
        (SOUND_EFFECTS[name]?.durationS ?? 0) *
          CREDITS_PER_SECOND *
          USD_PER_CREDIT,
      0,
    ) * 10000,
  ) / 10000;

/** Why the film has no effects, in words Carmen passes on. */
export function soundEffectsError(error) {
  if (isPaidPlanError(error))
    return "אפקטי הסאונד של ElevenLabs דורשים תוכנית בתשלום";
  if (isRejectedKeyError(error)) return "מפתח ה-ElevenLabs לא תקין לאפקטים";
  const message = error instanceof Error ? error.message : String(error);
  return `יצירת אפקטי הסאונד נכשלה: ${message.slice(0, 120)}`;
}
