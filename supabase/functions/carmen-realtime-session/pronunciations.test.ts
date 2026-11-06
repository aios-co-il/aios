import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  pronunciationInstructions,
  SAVE_PRONUNCIATION_TOOL,
} from "./pronunciations.ts";

Deno.test("the org's terms are listed as pronunciation bullets", () => {
  const text = pronunciationInstructions([
    { term: "AIOS", spoken: "אֵיי-אַיי-או-אֶס" },
    { term: "עדווה", spoken: "עַדְוָה" },
  ]);
  assertStringIncludes(text, "- AIOS ← אֵיי-אַיי-או-אֶס");
  assertStringIncludes(text, "- עדווה ← עַדְוָה");
});

Deno.test("without terms she still knows to save a correction", () => {
  const text = pronunciationInstructions([]);
  assertStringIncludes(text, "save_pronunciation");
  assertEquals(text.includes("הגי את המילים האלה"), false);
});

Deno.test("the save tool asks for the term and how to say it", () => {
  assertEquals(SAVE_PRONUNCIATION_TOOL.name, "save_pronunciation");
  assertEquals(SAVE_PRONUNCIATION_TOOL.parameters.required, ["term", "spoken"]);
});
