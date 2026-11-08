import { assertEquals } from "jsr:@std/assert@1";
import { fastLaneFits, type FastLaneTurn } from "./eligibility.ts";

const turn = (message: string, over: Partial<FastLaneTurn> = {}) =>
  fastLaneFits({
    message,
    channel: "app_chat",
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

Deno.test("a team member's private WhatsApp chat may try it too", () => {
  assertEquals(turn("בוקר טוב כרמן", { channel: "whatsapp_staff" }), true);
  assertEquals(turn("כן", { channel: "whatsapp_staff" }), false);
});

Deno.test(
  "other channels, other agents, pinned runs and long briefs skip it",
  () => {
    assertEquals(turn("מה שלומך?", { channel: null }), false);
    assertEquals(turn("מה שלומך?", { isCarmen: false }), false);
    assertEquals(turn("מה שלומך?", { pinned: true }), false);
    assertEquals(turn("א".repeat(601)), false);
    assertEquals(turn("   "), false);
  },
);
