import { assertEquals } from "jsr:@std/assert@1";
import { roundLlmSharePct } from "./llm-share.ts";

Deno.test("roundLlmSharePct", async (t) => {
  await t.step("a round LLM share of 0 turns the model off", () => {
    const share = (raw: unknown) => roundLlmSharePct(raw, 10);
    assertEquals([share(0), share("0"), share(5)], [0, 0, 5]);
    assertEquals(
      [share(null), share(""), share(false), share(-1)],
      [10, 10, 10, 10],
    );
  });

  await t.step("a share above 100 is capped", () => {
    assertEquals(roundLlmSharePct(250, 10), 100);
  });
});
