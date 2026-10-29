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

Deno.test("without org terms she knows the built-in marketing terms", () => {
  const text = pronunciationInstructions([]);
  assertStringIncludes(text, "save_pronunciation");
  assertStringIncludes(text, "- ROAS ← רוֹאַס");
  assertStringIncludes(text, "- כרמן ← כַּרְמֶן");
});

Deno.test("an org's correction replaces the built-in pronunciation", () => {
  const text = pronunciationInstructions([
    { term: " roas ", spoken: "אַר-אוֹ-אֵיי-אֶס" },
  ]);
  assertStringIncludes(text, "- roas ← אַר-אוֹ-אֵיי-אֶס");
  assertEquals(text.includes("רוֹאַס"), false);
});

Deno.test("the save tool asks for the term and how to say it", () => {
  assertEquals(SAVE_PRONUNCIATION_TOOL.name, "save_pronunciation");
  assertEquals(SAVE_PRONUNCIATION_TOOL.parameters.required, ["term", "spoken"]);
});
