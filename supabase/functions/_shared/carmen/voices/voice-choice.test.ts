import { assertEquals } from "jsr:@std/assert@1";
import { chooseRealtimeVoice } from "./voice-choice.ts";

Deno.test("the user's pick wins over Carmen's configured voice", () => {
  assertEquals(chooseRealtimeVoice("cedar", "shimmer"), "cedar");
});

Deno.test("without a pick, Carmen speaks her configured voice", () => {
  assertEquals(chooseRealtimeVoice(undefined, "shimmer"), "shimmer");
});

Deno.test("an unknown pick falls back to Carmen's configured voice", () => {
  assertEquals(chooseRealtimeVoice("robot", "sage"), "sage");
});

Deno.test("TTS-only agent voices map to the closest Realtime voice", () => {
  assertEquals(chooseRealtimeVoice(undefined, "nova"), "coral");
  assertEquals(chooseRealtimeVoice(undefined, "fable"), "ballad");
  assertEquals(chooseRealtimeVoice(undefined, "onyx"), "cedar");
});

Deno.test("with no usable voice, Carmen speaks marin", () => {
  assertEquals(chooseRealtimeVoice(undefined, null), "marin");
  assertEquals(chooseRealtimeVoice(undefined, "none"), "marin");
});
