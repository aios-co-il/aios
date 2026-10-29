import {
  assertAlmostEquals,
  assertStrictEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { SCRIPT_GUIDE } from "./film-script.ts";
import { PACE_GUIDE, maxWords, spokenSeconds } from "./script-pace.ts";

Deno.test("a beat says 2 words a second after its pauses", () => {
  // The line's end alone: (seconds - 0.3) x 2.
  assertStrictEquals(maxWords(2), 3);
  assertStrictEquals(maxWords(2.5), 4);
  // (3.3 - 0.3) x 2 is 5.999… in floating point; it is still 6 words.
  assertStrictEquals(maxWords(3.3), 6);
  assertStrictEquals(maxWords(0.2), 0);
  // Four commas take 1.4 s of a 2.5-second beat.
  assertStrictEquals(maxWords(2.5, "שיווק, מכירות, לידים, תוכן, SEO."), 1);
});

Deno.test("a beat's line at its most words fits, one more does not", () => {
  // `count` words, the first `pauses` of them followed by a comma, ending with a full stop.
  const line = (count: number, pauses: number) =>
    `${Array.from({ length: count }, (_, i) => (i < pauses ? "מילה," : "מילה")).join(" ")}.`;
  for (const seconds of [1, 2, 2.5, 3, 4.5, 5]) {
    for (const pauses of [0, 1, 2]) {
      const fits = maxWords(seconds, line(pauses + 1, pauses));
      if (fits > pauses) {
        assertStrictEquals(
          spokenSeconds(line(fits, pauses)) <= seconds + 1e-9,
          true,
        );
      }
      assertStrictEquals(
        spokenSeconds(line(Math.max(fits + 1, pauses + 1), pauses)) > seconds,
        true,
      );
    }
  }
});

Deno.test("a line takes its words and its pauses to say", () => {
  assertStrictEquals(spokenSeconds(""), 0);
  // Four words and the line's end.
  assertStrictEquals(spokenSeconds("כרמן רואה את כולם."), 2.3);
  // A list: each comma is a pause (it took 5 s on Staging), a trailing comma is not.
  assertStrictEquals(
    Math.round(spokenSeconds("שיווק, מכירות, לידים, תוכן, SEO.") * 100) / 100,
    4.2,
  );
  assertStrictEquals(spokenSeconds("שיווק,"), 0.8);
  // A hyphen inside a word ("ה-8") and a decimal point are no pause.
  assertStrictEquals(spokenSeconds("הקמפיינר ה-8"), 1.3);
  assertStrictEquals(spokenSeconds("רק 3.5 שניות"), 1.8);
});

Deno.test("a sentence end or a spaced dash inside a line is a pause", () => {
  // Three words, one pause inside, the end: 1.5 + 0.35 + 0.3.
  assertAlmostEquals(spokenSeconds("נמאס? תתחילו עכשיו!"), 2.15);
  assertAlmostEquals(spokenSeconds("זה נגמר. מתחילים."), 2.15);
  assertAlmostEquals(spokenSeconds("שיווק - מכירות"), 1.65);
  assertAlmostEquals(spokenSeconds("רגע... ואז"), 1.65);
});

Deno.test("Carmen is told the limit the save tool checks", () => {
  assertStringIncludes(SCRIPT_GUIDE, PACE_GUIDE);
  assertStringIncludes(PACE_GUIDE, `2.5 שניות: עד ${maxWords(2.5)} מילים`);
});
