import {
  assert,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFileSync } from "node:fs";

// executeTool cannot be imported, so these guards read run-ai-agent's source.
const agent = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

Deno.test("run-ai-agent chat readers: source guards", async (t) => {
  await t.step(
    "the three chat readers run through the chat scope wrapper",
    () => {
      assertMatch(
        caseBody("get_chat_history"),
        /return getChatHistory\(chatRead, args\);/,
      );
      assertMatch(
        caseBody("get_recent_inbound_messages"),
        /return getRecentInboundMessages\(chatRead, args\);/,
      );
      assertMatch(
        caseBody("search_conversation_history"),
        /return executeSearchConversationHistory\([\s\S]*toolContext,\s*chatRead,/,
      );
      const search = readFileSync(
        new URL("./executors/search-conversation-history.ts", import.meta.url),
        "utf8",
      );
      assertMatch(search, /= await scopedChatRead\(\s*chatRead,\s*null,?\s*\)/);
      assertMatch(search, /if \(refusal\) \{\s*return refusal;/);
      assertMatch(search, /readScopedChatRows\(/);
      assertMatch(search, /withChatScopeColumns\(/);
      assertMatch(search, /\.\.\.chatScopeMeta\(chatScope\)/);

      // The scope input comes from the verified caller, not from tool args.
      const scopeInput = agent.slice(
        agent.indexOf("const chatRead = {"),
        agent.indexOf("if (isVideoDirectorTool(name))"),
      );
      assertNotMatch(scopeInput, /args\./);
      assertMatch(scopeInput, /userId: actorUserId/);
      // callerRole is the highest role across all tenants; the scope reads the
      // role in this tenant itself.
      assertNotMatch(scopeInput, /callerRole|managedAgencyIds/);
    },
  );

  await t.step(
    "send_message looks up the client or lead inside the caller's tenants",
    () => {
      assertMatch(
        readFileSync(
          new URL("./executors/send-message.ts", import.meta.url),
          "utf8",
        ),
        /await sendTargetFor\(\s*supabase,\s*args\.contact_type,\s*args\.contact_id,\s*accessibleTenantIds,?\s*\)/,
      );
      assertStrictEquals(
        caseBody("send_message").split("executeSendMessage(").length,
        2,
      );
    },
  );
});

/** The source of one executeTool `case "<name>":` block. */
function caseBody(name: string): string {
  const start = agent.indexOf(`case "${name}":`);
  assert(start > 0, `case ${name} not found`);
  const end = agent.indexOf("\n    case ", start + 10);
  return agent.slice(start, end);
}
