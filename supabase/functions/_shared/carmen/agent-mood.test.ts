import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { agentMoodPrompt } from "./agent-mood.ts";

Deno.test("agentMoodPrompt returns the tone for a fixed mood", () => {
  assertStringIncludes(agentMoodPrompt("focused", "a") ?? "", "רציני ויעיל");
});

Deno.test("agentMoodPrompt returns null without a known mood", () => {
  assertEquals(agentMoodPrompt(null, "a"), null);
  assertEquals(agentMoodPrompt("sleepy", "a"), null);
});

Deno.test(
  "agentMoodPrompt picks a real mood for random, stable within a 3-day window",
  () => {
    const now = 86400000 * 30;
    const first = agentMoodPrompt("random", "agent-1", now);
    assertEquals(agentMoodPrompt("random", "agent-1", now + 1000), first);
    assertStringIncludes(first ?? "", "מצב רוח");
  },
);
