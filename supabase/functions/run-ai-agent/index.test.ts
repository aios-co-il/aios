import { assertMatch, assertNotMatch } from "jsr:@std/assert@1";
import { readFileSync } from "node:fs";

// executeTool cannot be imported, so these guards read run-ai-agent's source.
const chatContext = readFileSync(
  new URL("./tool-execution/chat-context.ts", import.meta.url),
  "utf8",
);

Deno.test("run-ai-agent chat readers: source guards", async (t) => {
  await t.step(
    "the three chat readers run through the chat scope wrapper",
    () => {
      assertMatch(
        readOwner("tool-execution/legacy-get-chat-history"),
        /return getChatHistory\(chatRead, args\);/,
      );
      assertMatch(
        readOwner("tool-execution/legacy-get-recent-inbound-messages"),
        /return getRecentInboundMessages\(chatRead, args\);/,
      );
      assertMatch(
        readOwner("tool-execution/legacy-search-conversation-history"),
        /return executeSearchConversationHistory\([\s\S]*context,\s*chatRead,/,
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
      const scopeInput = chatContext;
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
      assertMatch(
        readOwner("tool-execution/routes/messaging"),
        /send_message: bindToolRoute\(executeSendMessage\)/,
      );
    },
  );
});

/** Reads the source module that owns the routed tool. */
function readOwner(path: string): string {
  return readFileSync(new URL(`./${path}.ts`, import.meta.url), "utf8");
}
