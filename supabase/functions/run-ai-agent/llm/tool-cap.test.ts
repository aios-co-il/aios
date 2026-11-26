import { assert } from "jsr:@std/assert@1";
import { DEVICE_TOOL_NAMES } from "../../_shared/carmen/device/contract.ts";
import type { LLMTarget } from "./contracts.ts";
import { capToolsForTarget } from "./tool-cap.ts";

Deno.test("OpenAI capping keeps an offered device tool", () => {
  const target: LLMTarget = {
    provider: "openai",
    model: "test",
    label: "test",
    key: "test",
    url: "test",
  };
  // The device tool is appended last, after every other tool source (AIO-686).
  const tools = [
    ...Array.from({ length: 140 }, (_, index) => ({
      function: { name: `ordinary_${index}` },
    })),
    ...DEVICE_TOOL_NAMES.map((name) => ({ function: { name } })),
  ];

  const kept = new Set(
    capToolsForTarget(target, tools).map((tool) => tool.function.name),
  );

  for (const name of DEVICE_TOOL_NAMES) {
    assert(kept.has(name), name);
  }
});
