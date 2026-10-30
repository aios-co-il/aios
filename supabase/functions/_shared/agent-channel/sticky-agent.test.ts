import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  allowCreateNewCloudAgent,
  asCloudAgentId,
  billingNoteForSeat,
  busyOpenChatMessage,
  collectOpenChatIds,
  cursorDirectStickyEnabled,
  envOpenChatId,
  missingOpenChatMessage,
  uniqueCloudAgentIds,
} from "./sticky-agent.ts";

type MockRows = { data: unknown };

interface MockChain extends PromiseLike<MockRows> {
  select(): MockChain;
  match(): MockChain;
  not(): MockChain;
  order(): MockChain;
  limit(): MockChain;
  maybeSingle(): Promise<MockRows>;
}

function mockChain(single: unknown, rows: unknown): MockChain {
  const result: MockRows = { data: rows };
  const chain: MockChain = {
    select: () => chain,
    match: () => chain,
    not: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: single }),
    then: (onfulfilled, onrejected) =>
      Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return chain;
}

Deno.test("only bc- ids count as an open Cursor chat", () => {
  assertStrictEquals(
    asCloudAgentId("bc-7eb07a1e-7143-4b20-bf1e-fc529a24cc5c"),
    "bc-7eb07a1e-7143-4b20-bf1e-fc529a24cc5c",
  );
  assertStrictEquals(asCloudAgentId("webhook-1"), null);
  assertEquals(uniqueCloudAgentIds("bc-aaa", "nope", "bc-aaa", "bc-bbb"), [
    "bc-aaa",
    "bc-bbb",
  ]);
});

Deno.test(
  "Cursor Direct prefers CURSOR_DIRECT_AGENT_ID over the coding sticky",
  () => {
    assertStrictEquals(
      envOpenChatId("cursor", {
        CURSOR_DIRECT_AGENT_ID: "bc-direct",
        CURSOR_STICKY_AGENT_ID: "bc-coding",
      }),
      "bc-direct",
    );
    assertStrictEquals(
      envOpenChatId("cursor", { CURSOR_STICKY_AGENT_ID: "bc-coding" }),
      "bc-coding",
    );
  },
);

Deno.test(
  "new Background Agents are allowed by default; sticky is opt-in",
  () => {
    assertStrictEquals(cursorDirectStickyEnabled({}), false);
    assertStrictEquals(
      cursorDirectStickyEnabled({ CURSOR_DIRECT_STICKY: "true" }),
      true,
    );
    assertStrictEquals(allowCreateNewCloudAgent({}), true);
    assertStrictEquals(
      allowCreateNewCloudAgent({ CURSOR_DIRECT_ALLOW_CREATE: "false" }),
      false,
    );
    assertStrictEquals(
      allowCreateNewCloudAgent({ CURSOR_DIRECT_STICKY: "true" }),
      false,
    );
    assertStrictEquals(
      allowCreateNewCloudAgent({
        CURSOR_DIRECT_STICKY: "true",
        CURSOR_DIRECT_ALLOW_CREATE: "true",
      }),
      true,
    );
  },
);

Deno.test("Cursor is Carmen Direct; Codex is ChatGPT Workspace", () => {
  assertMatch(billingNoteForSeat("cursor"), /סוכן Cursor חדש/);
  assertMatch(billingNoteForSeat("codex"), /ChatGPT Workspace/);
  assertMatch(billingNoteForSeat("internal"), /OpenAI API/);
  assertMatch(missingOpenChatMessage("cursor"), /Cursor Direct/);
  assertMatch(
    busyOpenChatMessage("cursor", "https://cursor.com/agents/bc-1"),
    /מקביל/,
  );
});

Deno.test(
  "collectOpenChatIds without sticky only returns the current session",
  async () => {
    const calls: string[] = [];
    const sb = {
      from(table: string) {
        calls.push(table);
        return mockChain({ cursor_agent_id: "bc-sticky" }, []);
      },
    };

    const ids = await collectOpenChatIds(sb, {
      tenantId: "t1",
      provider: "cursor",
      sessionId: "bc-this-chat",
      env: { CURSOR_DIRECT_AGENT_ID: "bc-direct" },
    });
    assertEquals(ids, ["bc-this-chat"]);
    assertStrictEquals(calls.length, 0);
  },
);

Deno.test(
  "collectOpenChatIds with sticky merges session, env, sticky table, then last sessions",
  async () => {
    const calls: string[] = [];
    const sb = {
      from(table: string) {
        calls.push(table);
        const row =
          table === "cursor_sticky_agents"
            ? {
                cursor_agent_id: "bc-sticky",
                session_url: "https://cursor.com/agents/bc-sticky",
              }
            : null;
        const rows =
          table === "agent_channel_sessions"
            ? [{ external_session_id: "bc-session-old" }]
            : null;
        return mockChain(row, rows);
      },
    };

    const ids = await collectOpenChatIds(sb, {
      tenantId: "t1",
      provider: "cursor",
      sessionId: "bc-this-chat",
      env: {
        CURSOR_DIRECT_AGENT_ID: "bc-direct",
        CURSOR_DIRECT_STICKY: "true",
      },
    });
    assertEquals(ids, ["bc-this-chat", "bc-direct", "bc-session-old"]);
    assert(calls.includes("agent_channel_sessions"));
  },
);

Deno.test(
  "Cursor Direct without sticky and without session returns empty list",
  async () => {
    const sb = {
      from() {
        return mockChain(null, []);
      },
    };
    const ids = await collectOpenChatIds(sb, {
      tenantId: "t1",
      provider: "cursor",
      env: {},
    });
    assertEquals(ids, []);
  },
);

Deno.test("open-chat session rows tolerate malformed entries", async () => {
  const sb = {
    from(table: string) {
      return mockChain(
        null,
        table === "agent_channel_sessions"
          ? [
              null,
              { external_session_id: 7 },
              "bc-raw",
              { external_session_id: "bc-ok" },
            ]
          : null,
      );
    },
  };
  const ids = await collectOpenChatIds(sb, {
    tenantId: "t1",
    provider: "cursor",
    env: { CURSOR_DIRECT_STICKY: "true" },
  });
  assertEquals(ids, ["bc-ok"]);
});
