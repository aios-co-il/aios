/**
 * Carmen's opening line once a live voice call connects (AIO-543). One is picked per call so
 * she does not always say the same words. Short and gender-neutral: the app has already said
 * "אני כבר איתך" while the call connected.
 */
export const CONNECTED_GREETINGS: ReadonlyArray<string> = [
  "כן, אני איתך.",
  "כן, אני כאן.",
  "אני איתך, מה צריך?",
  "כן, במה אפשר לעזור?",
  "כאן איתך. מה על הפרק?",
  "כן, אני שומעת.",
];

/** A greeting for this call; [random] returns a number in [0, 1), like `Math.random`. */
export function pickGreeting(random: () => number = Math.random): string {
  const index = Math.floor(random() * CONNECTED_GREETINGS.length);
  return CONNECTED_GREETINGS[Math.min(index, CONNECTED_GREETINGS.length - 1)];
}
