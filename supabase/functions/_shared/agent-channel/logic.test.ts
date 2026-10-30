import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  acceptedMessageFor,
  canAdvanceToReview,
  canSynthesize,
  capabilitiesForProvider,
  markParliamentFailed,
  parliamentSeatsFromConfig,
  parseBrainRoute,
  withParliamentContext,
  recordParliamentAnswer,
  resolveCallbackOrigin,
  type ParliamentState,
} from "./logic.ts";

function base(): ParliamentState {
  return {
    round: 1,
    max_rounds: 2,
    seats: { cursor: { provider: "cursor" }, grok: { provider: "grok" } },
    status: "round1",
    topic: "How should we ship X?",
    tools: "read_only",
  };
}

Deno.test("parliament MVP seats default to cursor+grok+codex", () => {
  assertEquals(parliamentSeatsFromConfig({}), ["cursor", "grok", "codex"]);
  assertEquals(
    parliamentSeatsFromConfig({
      seats: ["cursor", "grok", "codex", "claude", "extra"],
    }),
    ["cursor", "grok", "codex", "claude"],
  );
});

Deno.test("partial failure does not block synthesis", () => {
  let state = recordParliamentAnswer(base(), "cursor", "ship it", 1);
  state = markParliamentFailed(state, "grok", "timeout");
  assertStrictEquals(canAdvanceToReview(state), true);
  state = { ...state, status: "round2", round: 2 };
  state = recordParliamentAnswer(state, "cursor", "still ship it", 2);
  assertStrictEquals(canSynthesize(state), true);
});

Deno.test("reused Cursor Direct copy says the chat was already open", () => {
  assertMatch(
    acceptedMessageFor("cursor", "https://cursor.com/agents/bc-1", {
      reused: true,
    }),
    /שכבר פתוח/,
  );
  assertMatch(
    acceptedMessageFor("codex", "https://chatgpt.com/c/abc", { reused: true }),
    /ChatGPT Workspace/,
  );
});

Deno.test("direct channels require a callback; internal streams", () => {
  assertStrictEquals(capabilitiesForProvider("internal").streaming_reply, true);
  assertStrictEquals(
    capabilitiesForProvider("internal").callback_required,
    false,
  );
  assertStrictEquals(capabilitiesForProvider("cursor").callback_required, true);
  assertStrictEquals(capabilitiesForProvider("codex").callback_required, true);
  assertStrictEquals(
    capabilitiesForProvider("chatgpt").callback_required,
    true,
  );
});

Deno.test(
  "resolveCallbackOrigin prefers session codex over stated chatgpt",
  () => {
    assertStrictEquals(resolveCallbackOrigin("chatgpt", "codex"), "codex");
    assertStrictEquals(resolveCallbackOrigin("codex", "chatgpt"), "chatgpt");
    assertStrictEquals(resolveCallbackOrigin(undefined, "codex"), "codex");
    assertStrictEquals(resolveCallbackOrigin(null, null), "internal");
  },
);

Deno.test(
  "database route parser validates enums and handles absent routes",
  () => {
    const row = {
      id: "route",
      tenant_id: "tenant",
      agent_id: null,
      slug: "parliament",
      label: "Parliament",
      route_type: "parliament",
      provider: "parliament",
      connection_id: null,
      config: { rounds: 2 },
      active: true,
      created_at: "now",
      updated_at: "now",
    };
    assertEquals(parseBrainRoute(row)?.config, { rounds: 2 });
    assertStrictEquals(parseBrainRoute(row)?.route_type, "parliament");
    assertStrictEquals(parseBrainRoute(null), null);
    assertStrictEquals(
      parseBrainRoute({ ...row, route_type: "invalid" }),
      null,
    );
    assertStrictEquals(parseBrainRoute({ ...row, provider: "invalid" }), null);
    assertEquals(parseBrainRoute({ ...row, config: null })?.config, {});
  },
);

Deno.test(
  "parliament context keeps existing metadata and serializable state",
  () => {
    const state = base();
    const context = { conversation_id: "conversation", nested: { keep: true } };
    const result = withParliamentContext(context, state);
    assertEquals(result, { ...context, parliament: state });
    assertEquals(JSON.parse(JSON.stringify(result)), result);
    assertEquals(context, {
      conversation_id: "conversation",
      nested: { keep: true },
    });
    assertEquals(withParliamentContext(null, state), { parliament: state });
  },
);
