import type { MiniMeGender } from "../_shared/carmen/minime-gender.ts";

/**
 * Who opens the call: the effective character's name (null for Carmen
 * herself, who keeps her unnamed lines) and the gender her verbs take.
 */
export type GreetingCharacter = {
  name: string | null;
  gender: MiniMeGender;
};

/** Carmen herself: no name in the line, feminine verbs. */
export const CARMEN_GREETER: GreetingCharacter = {
  name: null,
  gender: "female",
};

/**
 * Lines any character can say: short and without a gendered verb, since the
 * app has already said "אני כבר איתך" while the call connected (AIO-543).
 */
const NEUTRAL_GREETINGS: ReadonlyArray<string> = [
  "כן, אני איתך.",
  "כן, אני כאן.",
  "אני איתך, מה צריך?",
  "כן, במה אפשר לעזור?",
  "כאן איתך. מה על הפרק?",
];

/** The one line whose verb follows the speaker's gender. */
const LISTENING: Record<MiniMeGender, string> = {
  female: "כן, אני שומעת.",
  male: "כן, אני שומע.",
};

/**
 * Every opening line the character may say once a live voice call connects:
 * the neutral ones, the listening line in its gender, and for a character
 * other than Carmen one line that names it.
 */
export function connectedGreetings(
  character: GreetingCharacter,
): Array<string> {
  const named = character.name ? [`${character.name} כאן. מה צריך?`] : [];
  return [...NEUTRAL_GREETINGS, LISTENING[character.gender], ...named];
}

/**
 * The line this call opens with, picked per call so she does not always say
 * the same words; [random] returns a number in [0, 1), like `Math.random`.
 */
export function pickGreeting(
  character: GreetingCharacter = CARMEN_GREETER,
  random: () => number = Math.random,
): string {
  const lines = connectedGreetings(character);
  const index = Math.floor(random() * lines.length);
  return lines[Math.min(index, lines.length - 1)];
}
