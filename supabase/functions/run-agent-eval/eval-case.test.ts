import { assertEquals } from "jsr:@std/assert@1";
import { readEvalCase } from "./eval-case.ts";

Deno.test("readEvalCase reads input and expected values", () => {
  assertEquals(readEvalCase({ input: "q", expected: { a: 1 } }), {
    input: "q",
    expected: "",
  });
  assertEquals(readEvalCase({ input: 0, expected: null }), {
    input: "",
    expected: "",
  });
});

Deno.test("readEvalCase defaults missing values and non-object cases", () => {
  for (const testCase of [{}, null, "q", ["q"]]) {
    assertEquals(readEvalCase(testCase), { input: "", expected: "" });
  }
});
