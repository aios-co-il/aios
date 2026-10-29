import { assertEquals } from "jsr:@std/assert@1";
import {
  enclosingOpener,
  maskSource,
  matchingCloser,
  statementEnd,
} from "./source-mask.ts";

Deno.test("maskSource", async (t) => {
  await t.step("blanks comments in both, literals in code only", () => {
    const text = 'call("a(b") // c(d\n/* e{ */ x';
    const { plain, code } = maskSource(text);
    const comments = `${" ".repeat(7)}\n${" ".repeat(9)}x`;
    assertEquals(plain, `call("a(b")${comments}`);
    assertEquals(code, `call("   ")${comments}`);
  });

  await t.step("keeps template expressions as code, not their braces", () => {
    const { code } = maskSource("f(`a${g(x)}b{`)");
    assertEquals(code, "f(`   g(x)   `)");
  });

  await t.step("tells a regular expression from a division", () => {
    const { code } = maskSource("a = /[)/]/.test(b) / 2;");
    assertEquals(code, "a = /    /.test(b) / 2;");
  });
});

Deno.test("bracket navigation over masked code", () => {
  const code = "const a = f(x, { y: [1] });";
  const brace = code.indexOf("{");
  assertEquals(enclosingOpener(code, code.indexOf("y")), brace);
  assertEquals(code[matchingCloser(code, code.indexOf("("))], ")");
  assertEquals(statementEnd(code, code.indexOf("=") + 1), code.length - 1);
});
