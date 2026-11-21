import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { readEvalCase } from "./eval-case.ts";
Deno.test(
  "evaluation ground truth is formatted without erasing valid values",
  () => {
    assertEquals(readEvalCase({ input: "q", expected: 42 }), {
      input: "q",
      expected: "42",
    });
    assertEquals(readEvalCase({ input: "q", expected: { a: 1 } }), {
      input: "q",
      expected: '{"a":1}',
    });
    assertEquals(
      readEvalCase({ input: "q", expected: false }).expected,
      "false",
    );
    assertThrows(() => readEvalCase({ input: {}, expected: "answer" }));
  },
);
