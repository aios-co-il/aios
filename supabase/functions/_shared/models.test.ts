import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { MODEL_CATALOG, resolveModelId } from "./models.ts";

Deno.test(
  "an agent set to a Responses-only pro model runs on its chat sibling",
  () => {
    assertStrictEquals(resolveModelId("gpt-5.5-pro"), "openai/gpt-5.5");
    assertStrictEquals(resolveModelId("openai/gpt-5.5-pro"), "openai/gpt-5.5");
    assertStrictEquals(resolveModelId("gpt-5.4-pro"), "openai/gpt-5.4");
  },
);

Deno.test("the engine picker offers no OpenAI pro model", () => {
  const pro = MODEL_CATALOG.filter((m) => /^openai\/.*-pro$/.test(m.id));
  assertEquals(pro, []);
});
