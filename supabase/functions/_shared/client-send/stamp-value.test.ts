import { assertEquals } from "jsr:@std/assert@1";
import { maskSource } from "./source-mask.ts";
import { argsStamped, initializer } from "./stamp-value.ts";

/** Whether the last call in the source always carries a sendKind. */
function lastCallStamped(...lines: string[]): boolean {
  const { code } = maskSource(lines.join("\n"));
  const open = code.lastIndexOf("send(") + "send".length;
  return argsStamped(code, { open, close: code.lastIndexOf(")") + 1 });
}

Deno.test("argsStamped", async (t) => {
  await t.step("a key in the body, not in one branch of it", () => {
    assertEquals(lastCallStamped('send({ to, sendKind: "a" })'), true);
    assertEquals(
      lastCallStamped("send({ to, ...(c ? { sendKind } : {}) })"),
      false,
    );
    assertEquals(
      lastCallStamped("send({ to, ...(c && { sendKind }) })"),
      false,
    );
    assertEquals(lastCallStamped("send({ to, kind: x.sendKind })"), false);
  });

  await t.step("a body variable or spread, followed", () => {
    assertEquals(
      lastCallStamped(
        'const body = { sendKind: "a" };',
        "send({ body: JSON.stringify(body) })",
      ),
      true,
    );
    assertEquals(
      lastCallStamped(
        'const stamp = { sendKind: "a" };',
        "const withClient = c ? { ...stamp, c } : stamp;",
        "send({ to, ...withClient })",
      ),
      true,
    );
    assertEquals(
      lastCallStamped(
        'const stamp = { sendKind: "a" };',
        "const maybe = c ? stamp : {};",
        "send({ to, ...maybe })",
      ),
      false,
    );
  });
});

Deno.test("initializer reads the nearest declaration's value", () => {
  const { code } = maskSource(
    'const a = { x: 1 };\nconst a$: T = "b";\nuse(a);',
  );
  const value = initializer(code, "a", code.indexOf("use"));
  assertEquals(value && code.slice(value.open, value.close).trim(), "{ x: 1 }");
});
