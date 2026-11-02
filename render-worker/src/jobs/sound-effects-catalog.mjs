/** The film's sound effects: what each one is asked as, what it costs, and why one is missing. */
import { isPaidPlanError, isRejectedKeyError } from "../providers/plan.mjs";

/**
 * Bumped when the prompts change, so an older film's effects are made again. Version 1 was one
 * whoosh at every cut and a deep impact; a film made then keeps them until a production makes
 * this set (LEGACY_EFFECTS).
 */
export const SOUND_EFFECTS_VERSION = 2;
/** ElevenLabs bills 40 credits per second of a sound effect with a set duration. */
const CREDITS_PER_SECOND = 40;
/** Planning price of one ElevenLabs credit (paid plans, overage rate). */
const USD_PER_CREDIT = 0.0003;

/** What every prompt asks for, so no transition turns into a trailer hit. */
const SUBTLE =
  "Subtle, clean and short, soft and gentle, no heavy impact, no bass hit, no music, no voice.";

/**
 * The set: six transition sounds of different characters, a different one at each cut
 * (compose/transition-sounds.mjs), and one soft low impact on the opening title and the end
 * card. Each is made once per film; the mix keeps them gentle (compose/music-bed.mjs).
 */
export const SOUND_EFFECTS = {
  air: {
    kind: "transition",
    text: `Soft airy whoosh transition: a gentle breath of air that sweeps past and fades. ${SUBTLE}`,
    durationS: 1,
    promptInfluence: 0.7,
  },
  shimmer: {
    kind: "transition",
    text: `Delicate glassy shimmer swipe: a light crystalline sparkle that brushes past and fades. ${SUBTLE}`,
    durationS: 1,
    promptInfluence: 0.7,
  },
  blip: {
    kind: "transition",
    text: `Soft digital blip sweep: a short smooth electronic blip that glides upward and fades, like a link connecting. No harsh beep. ${SUBTLE}`,
    durationS: 0.7,
    promptInfluence: 0.7,
  },
  swish: {
    kind: "transition",
    text: `Gentle swish with a soft tonal tail: a quick smooth swish that settles into a short warm tone and fades. ${SUBTLE}`,
    durationS: 1,
    promptInfluence: 0.7,
  },
  chime: {
    kind: "transition",
    text: `Light airy chime rise: a soft rising shimmer of tiny chimes that lifts and fades, no melody. ${SUBTLE}`,
    durationS: 1.2,
    promptInfluence: 0.7,
  },
  swipe: {
    kind: "transition",
    text: `Soft minimal UI swipe with a muted click: a quick light swipe that ends in a gentle muted tap. ${SUBTLE}`,
    durationS: 0.6,
    promptInfluence: 0.7,
  },
  impact: {
    kind: "impact",
    text: "Gentle low hit: one soft warm boom with a short smooth fade, felt more than heard. Subtle and restrained, no sharp crack, no rumble build-up, no music, no voice.",
    durationS: 2,
    promptInfluence: 0.6,
  },
};

export const SOUND_EFFECT_NAMES = Object.keys(SOUND_EFFECTS);
/** The transition sounds, in the set's order (the order a film's cuts draw from). */
export const TRANSITION_NAMES = SOUND_EFFECT_NAMES.filter(
  (name) => SOUND_EFFECTS[name].kind === "transition",
);

/** Version 1's effects (effect name to kind), stored by films made before this set. */
export const LEGACY_EFFECTS = { whoosh: "transition", impact: "impact" };

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
