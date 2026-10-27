import {
  assert,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFileSync } from "node:fs";

// executeTool cannot be imported, so these guards read run-ai-agent's source.
const agent = readFileSync(new URL("../index.ts", import.meta.url), "utf8");

Deno.test("run-ai-agent chat readers: source guards", async (t) => {
  await t.step(
    "the three chat readers run through the chat scope wrapper",
    () => {
      for (const name of [
        "get_chat_history",
        "search_conversation_history",
        "get_recent_inbound_messages",
      ]) {
        const body = caseBody(name);
        assertMatch(body, /await chatScopeFor\(\)/, name);
        assertMatch(body, /const refusal = await chatReadRefusal\(/, name);
        assertMatch(body, /if \(refusal\) \{\s*return refusal;/, name);
        assertMatch(body, /readScopedChatRows(<\w+>)?\(/, name);
        assertMatch(body, /withChatScopeColumns\(/, name);
      }

      assertMatch(
        caseBody("get_chat_history"),
        /chatReadRefusal\(\s*supabase,\s*chatScope,\s*\{ type: args\.contact_type, id: args\.contact_id \}/,
      );
      // The scope input comes from the verified caller, not from tool args.
      const scopeInput = agent.slice(
        agent.indexOf("const chatScopeFor = () =>"),
        agent.indexOf("if (isVideoDirectorTool(name))"),
      );
      assertNotMatch(scopeInput, /args\./);
      assertMatch(scopeInput, /userId: actorUserId/);
      // callerRole is the highest role across all tenants; the scope reads the
      // role in this tenant itself.
      assertNotMatch(scopeInput, /callerRole|managedAgencyIds/);
    },
  );

  await t.step("get_recent_inbound_messages keeps its old output shape", () => {
    assertMatch(
      caseBody("get_recent_inbound_messages"),
      /connection_user_id: _conn,\s*provider: _provider,\s*group_id: _group,/,
    );
  });

  await t.step(
    "send_message looks up the client or lead inside the caller's tenants",
    () => {
      const body = caseBody("send_message");
      const lookups = body.match(/\.in\("tenant_id", accessibleTenantIds\)/g);
      assertStrictEquals(lookups?.length, 2);
    },
  );
});

/** The source of one executeTool `case "<name>": { … }` block. */
function caseBody(name: string): string {
  const start = agent.indexOf(`case "${name}": {`);
  assert(start > 0, `case ${name} not found`);
  const end = agent.indexOf("\n    case ", start + 10);
  return agent.slice(start, end);
}
