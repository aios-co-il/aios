import { assert, assertEquals } from "jsr:@std/assert@1";
import { CONNECTED_GREETINGS, pickGreeting } from "./greetings.ts";

Deno.test("pickGreeting spreads over every greeting", () => {
  const picked = CONNECTED_GREETINGS.map((_, i) =>
    pickGreeting(() => i / CONNECTED_GREETINGS.length),
  );
  assertEquals(picked, [...CONNECTED_GREETINGS]);
});

Deno.test("pickGreeting stays in range at the top edge", () => {
  assertEquals(
    pickGreeting(() => 0.999999),
    CONNECTED_GREETINGS[CONNECTED_GREETINGS.length - 1],
  );
});

Deno.test("no greeting falls back to the old generic line", () => {
  assert(CONNECTED_GREETINGS.every((g) => !g.includes("מקשיבה")));
});
