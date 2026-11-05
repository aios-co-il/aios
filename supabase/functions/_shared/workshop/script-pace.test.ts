import { assertStrictEquals } from "jsr:@std/assert@1";
import { maxWords, spokenSeconds } from "./script-pace.ts";

Deno.test("a beat says at most 2 words a second", () => {
  assertStrictEquals(maxWords(2), 4);
  assertStrictEquals(maxWords(3), 6);
  assertStrictEquals(maxWords(0.2), 1);
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
  // A hyphen inside a word ("ה-8") is no pause.
  assertStrictEquals(spokenSeconds("הקמפיינר ה-8"), 1.3);
});
