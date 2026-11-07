import { assertEquals } from "jsr:@std/assert@1";
import { fastLaneFits, type FastLaneTurn } from "./eligibility.ts";

const turn = (message: string, over: Partial<FastLaneTurn> = {}) =>
  fastLaneFits({
    message,
    streaming: true,
    appChatTurn: true,
    isCarmen: true,
    pinned: false,
    ...over,
  });

Deno.test("a plain chat question may try the fast lane", () => {
  assertEquals(turn("היי כרמן, מה שלומך?"), true);
  assertEquals(turn("איזה לקוחות יש בסוכנות של דורון?"), true);
});

Deno.test("turns the full path reads in code skip it", () => {
  assertEquals(turn("כן"), false);
  assertEquals(turn("מאשר"), false);
  assertEquals(turn("לא, תבטלי"), false);
  assertEquals(turn("תזכרי שעדווה היא המעצבת החדשה"), false);
  assertEquals(turn("מעכשיו תשלחי לי סיכום כל בוקר"), false);
});

Deno.test(
  "service calls, other agents, pinned runs and long briefs skip it",
  () => {
    assertEquals(turn("מה שלומך?", { streaming: false }), false);
    assertEquals(turn("מה שלומך?", { appChatTurn: false }), false);
    assertEquals(turn("מה שלומך?", { isCarmen: false }), false);
    assertEquals(turn("מה שלומך?", { pinned: true }), false);
    assertEquals(turn("א".repeat(601)), false);
    assertEquals(turn("   "), false);
  },
);
