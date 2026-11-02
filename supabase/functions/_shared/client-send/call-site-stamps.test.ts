import { assertEquals } from "jsr:@std/assert@1";
import { senderCalls } from "./call-site-stamps.ts";

const SENDERS = ["send-x"];

/** The [line, stamped] pairs the scan reads from these lines. */
function scan(...lines: string[]): [number, boolean][] {
  return senderCalls(lines.join("\n"), SENDERS).map((call) => [
    call.line,
    call.stamped,
  ]);
}

Deno.test("senderCalls finds each call of a guarded sender", async (t) => {
  await t.step("an inline body, stamped or not", () => {
    assertEquals(
      scan(
        'fetch(`${u}/functions/v1/send-x`, { body: JSON.stringify({ sendKind: "a" }) });',
        "fetch(`${u}/functions/v1/send-x`, { body: JSON.stringify({ to }) });",
        "// fetch(`${u}/functions/v1/send-x`);",
      ),
      [
        [1, true],
        [2, false],
      ],
    );
  });

  await t.step("a body variable, followed to its value", () => {
    assertEquals(
      scan(
        'const body = { tenantId, sendKind: "staff_alert" };',
        "await fetch(`${u}/functions/v1/send-x`, { body: JSON.stringify(body) });",
      ),
      [[2, true]],
    );
  });

  await t.step("not a key set only in one branch", () => {
    assertEquals(
      scan(
        'const payload = { to, ...(client ? { sendKind: "automation" } : {}) };',
        "await fetch(`${u}/functions/v1/send-x`, { body: JSON.stringify(payload) });",
      ),
      [[2, false]],
    );
  });

  await t.step("both branches of a ternary that stamp", () => {
    assertEquals(
      scan(
        'const stamp = { sendKind: "broadcast", sendRef: id };',
        "const withClient = clientId ? { ...stamp, clientId } : stamp;",
        'invoke("send-x", { to, ...withClient });',
        "fetch(`${u}/functions/v1/${name}`);",
      ),
      [[3, true]],
    );
  });

  await t.step("a URL in a variable, by the requests in its block", () => {
    assertEquals(
      scan(
        "function a() {",
        "  const url = `${u}/functions/v1/send-x`;",
        "  log(url);",
        "  return fetch(url, { body: JSON.stringify({ to }) });",
        "}",
        "function b() {",
        "  const url = `${u}/functions/v1/other`;",
        "  return fetch(url, {});",
        "}",
      ),
      [[4, false]],
    );
  });

  await t.step("through a helper, each of its calls", () => {
    assertEquals(
      scan(
        "const send = async (payload: Record<string, unknown>) => {",
        "  await fetch(`${u}/functions/v1/send-x`, {",
        "    body: JSON.stringify({ tenantId, ...payload }),",
        "  });",
        "};",
        'await send({ groupId, sendKind: "carmen" });',
        "await send({ phoneNumber });",
      ),
      [
        [6, true],
        [7, false],
      ],
    );
  });

  await t.step("a name kept in a constant, by the built URL requests", () => {
    const post = (body: string) =>
      scan(
        'export const SEND_FN = "send-x";',
        "export const post = (name: string, kind: string) =>",
        `  fetch(\`\${u}/functions/v1/\${name}\`, { body: JSON.stringify(${body}) });`,
      );
    assertEquals(post("{ to, sendKind: kind }"), [[3, true]]);
    assertEquals(post("{ to }"), [[3, false]]);
  });

  await t.step("a name returned for a built URL", () => {
    assertEquals(
      scan(
        'function route(type: string) { if (type === "a") return "send-x"; return "y"; }',
        "await fetch(`${u}/functions/v1/${route(t)}`, { body: JSON.stringify(b) });",
      ),
      [[2, false]],
    );
  });
});
