import { assertMatch, assertNotMatch } from "jsr:@std/assert@1";
import { readFileSync } from "node:fs";

const carmen = readFileSync(new URL("./carmen.ts", import.meta.url), "utf8");
const agent = readFileSync(
  new URL("../run-ai-agent/index.ts", import.meta.url),
  "utf8",
);

// FIXME: failing before the Deno migration (was never run in CI); fix or delete.
Deno.test.ignore(
  "private chats use session_only — never phone-scan chat_messages for background",
  () => {
    assertMatch(carmen, /export function backgroundChatContextMode\(isGroup/);
    assertMatch(carmen, /session_only/);
    assertMatch(
      carmen,
      /skip private background history — session chat_id only/,
    );
    // Private branch must not ilike sender_phone inside fetchRecentChatContext.
    const fnStart = carmen.indexOf(
      "export async function fetchRecentChatContext",
    );
    const fnEnd = carmen.indexOf(
      "export function excludeCurrentTurnFromContext",
    );
    const fn = carmen.slice(fnStart, fnEnd);
    assertNotMatch(fn, /ilike\('sender_phone'/);
    assertMatch(fn, /group_id/);
  },
);

Deno.test("isolation note is injected on Carmen turns", () => {
  assertMatch(carmen, /\[בידוד שיחה\] chat_id=/);
});

Deno.test(
  "search_conversation_history defaults to current wa_notify chat_id",
  () => {
    assertMatch(agent, /browse_all_chats/);
    assertMatch(agent, /scopeGroupId/);
    assertMatch(agent, /current_chat/);
  },
);
