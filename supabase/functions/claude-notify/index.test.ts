import { assertMatch, assertNotMatch } from "jsr:@std/assert@1";

Deno.test("claude-notify index", async (t) => {
  await t.step("only wires env into the handler", async () => {
    const source = await Deno.readTextFile(
      new URL("./index.ts", import.meta.url),
    );
    assertMatch(source, /createClaudeNotifyHandler/);
    assertMatch(source, /CLAUDE_MCP_BEARER/);
    assertMatch(source, /createSupabase: serviceClient/);
    assertNotMatch(source, /functions\/v1\//);
  });
});
