import assert from "node:assert/strict";
import test from "node:test";
import {
  asCursorSessionId,
  cursorSessionUrl,
  type CursorSessionQuery,
  type CursorSessionReader,
  missingCursorDirectSessionError,
  resolveCursorDirectSession,
} from "./cursor-direct-session.ts";

function mockReader(
  single: (table: string) => unknown,
  rows: unknown = [],
): CursorSessionReader {
  return {
    from(table) {
      const chain: CursorSessionQuery = {
        match: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: single(table) }),
        then(resolve, reject) {
          return Promise.resolve({ data: rows }).then(resolve, reject);
        },
      };
      return { select: () => chain };
    },
  };
}

test("asCursorSessionId accepts bc- ids only", () => {
  assert.equal(asCursorSessionId("bc-abc"), "bc-abc");
  assert.equal(asCursorSessionId("nope"), null);
});

test("resolveCursorDirectSession prefers CURSOR_DIRECT_AGENT_ID", async () => {
  const session = await resolveCursorDirectSession(null, {
    tenantId: "t1",
    env: {
      CURSOR_DIRECT_AGENT_ID: "bc-direct",
      CURSOR_STICKY_AGENT_ID: "bc-sticky",
    },
  });
  assert.deepEqual(session, {
    sessionId: "bc-direct",
    sessionUrl: cursorSessionUrl("bc-direct"),
    source: "env:CURSOR_DIRECT_AGENT_ID",
  });
});

test("resolveCursorDirectSession falls back to cursor_sticky_agents", async () => {
  const sb = mockReader((table) =>
    table === "cursor_sticky_agents"
      ? {
          cursor_agent_id: "bc-sticky-db",
          session_url: "https://cursor.com/agents/bc-sticky-db",
        }
      : null,
  );
  const session = await resolveCursorDirectSession(sb, {
    tenantId: "t1",
    env: {},
  });
  assert.equal(session?.sessionId, "bc-sticky-db");
  assert.equal(session?.source, "db:cursor_sticky_agents");
});

test("resolveCursorDirectSession falls back to the latest cursor channel session", async () => {
  const sb = mockReader(() => null, [{ external_session_id: "bc-last" }]);
  const session = await resolveCursorDirectSession(sb, {
    tenantId: "t1",
    env: {},
  });
  assert.deepEqual(session, {
    sessionId: "bc-last",
    sessionUrl: cursorSessionUrl("bc-last"),
    source: "db:agent_channel_sessions",
  });
});

test("resolveCursorDirectSession returns null when nothing configured", async () => {
  const sb = mockReader(() => null);
  const session = await resolveCursorDirectSession(sb, {
    tenantId: "t1",
    env: {},
  });
  assert.equal(session, null);
  assert.match(missingCursorDirectSessionError(), /CURSOR_DIRECT_AGENT_ID/);
  assert.match(missingCursorDirectSessionError(), /ask_cursor/);
});
