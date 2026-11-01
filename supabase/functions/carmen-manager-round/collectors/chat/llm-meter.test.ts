import { assertEquals } from "jsr:@std/assert@1";
import { CHAT_LLM_SOURCE, createLlmMeter } from "./llm-meter.ts";

Deno.test("createLlmMeter", async (t) => {
  await t.step("counts each finished call and adds up its cost", () => {
    const meter = createLlmMeter();
    assertEquals(meter.usage(), { calls: 0, costUsd: 0 });
    meter.add(0.002);
    meter.add(0);
    meter.add(0.003);
    assertEquals(meter.usage().calls, 3);
    assertEquals(Math.round(meter.usage().costUsd * 1e6) / 1e6, 0.005);
  });

  await t.step("the usage log names the round's chat source", () => {
    assertEquals(CHAT_LLM_SOURCE, "manager_round:chat");
  });
});
