import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  asCursorSessionId,
  cursorSessionUrl,
  missingCursorDirectSessionError,
  resolveCursorDirectSession,
} from "./cursor-direct-session.ts";

Deno.test("asCursorSessionId accepts bc- ids only", () => {
  assertStrictEquals(asCursorSessionId("bc-abc"), "bc-abc");
  assertStrictEquals(asCursorSessionId("nope"), null);
});

Deno.test(
  "resolveCursorDirectSession prefers CURSOR_DIRECT_AGENT_ID",
  async () => {
    const session = await resolveCursorDirectSession(null, {
      tenantId: "t1",
      env: {
        CURSOR_DIRECT_AGENT_ID: "bc-direct",
        CURSOR_STICKY_AGENT_ID: "bc-sticky",
      },
    });
    assertEquals(session, {
      sessionId: "bc-direct",
      sessionUrl: cursorSessionUrl("bc-direct"),
      source: "env:CURSOR_DIRECT_AGENT_ID",
    });
  },
);

Deno.test(
  "resolveCursorDirectSession falls back to cursor_sticky_agents",
  async () => {
    const sb = {
      from(table: string) {
        const chain: any = {
          select() {
            return chain;
          },
          eq() {
            return chain;
          },
          not() {
            return chain;
          },
          order() {
            return chain;
          },
          limit() {
            return chain;
          },
          maybeSingle: async () =>
            table === "cursor_sticky_agents"
              ? {
                  data: {
                    cursor_agent_id: "bc-sticky-db",
                    session_url: "https://cursor.com/agents/bc-sticky-db",
                  },
                }
              : { data: null },
          then(resolve: (v: { data: unknown }) => unknown) {
            return Promise.resolve({ data: [] }).then(resolve);
          },
        };
        return chain;
      },
    };
    const session = await resolveCursorDirectSession(sb, {
      tenantId: "t1",
      env: {},
    });
    assertStrictEquals(session?.sessionId, "bc-sticky-db");
    assertStrictEquals(session?.source, "db:cursor_sticky_agents");
  },
);

Deno.test(
  "resolveCursorDirectSession returns null when nothing configured",
  async () => {
    const sb = {
      from() {
        const chain: any = {
          select() {
            return chain;
          },
          eq() {
            return chain;
          },
          not() {
            return chain;
          },
          order() {
            return chain;
          },
          limit() {
            return chain;
          },
          maybeSingle: async () => ({ data: null }),
          then(resolve: (v: { data: unknown }) => unknown) {
            return Promise.resolve({ data: [] }).then(resolve);
          },
        };
        return chain;
      },
    };
    const session = await resolveCursorDirectSession(sb, {
      tenantId: "t1",
      env: {},
    });
    assertStrictEquals(session, null);
    assertMatch(missingCursorDirectSessionError(), /CURSOR_DIRECT_AGENT_ID/);
    assertMatch(missingCursorDirectSessionError(), /ask_cursor/);
  },
);
