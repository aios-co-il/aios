import assert from "node:assert/strict";
import test from "node:test";
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

test("parliament MVP seats default to cursor+grok+codex", () => {
  assert.deepEqual(parliamentSeatsFromConfig({}), ["cursor", "grok", "codex"]);
  assert.deepEqual(
    parliamentSeatsFromConfig({
      seats: ["cursor", "grok", "codex", "claude", "extra"],
    }),
    ["cursor", "grok", "codex", "claude"],
  );
});

test("partial failure does not block synthesis", () => {
  let state = recordParliamentAnswer(base(), "cursor", "ship it", 1);
  state = markParliamentFailed(state, "grok", "timeout");
  assert.equal(canAdvanceToReview(state), true);
  state = { ...state, status: "round2", round: 2 };
  state = recordParliamentAnswer(state, "cursor", "still ship it", 2);
  assert.equal(canSynthesize(state), true);
});

test("reused Cursor Direct copy says the chat was already open", () => {
  assert.match(
    acceptedMessageFor("cursor", "https://cursor.com/agents/bc-1", {
      reused: true,
    }),
    /שכבר פתוח/,
  );
  assert.match(
    acceptedMessageFor("codex", "https://chatgpt.com/c/abc", { reused: true }),
    /ChatGPT Workspace/,
  );
});

test("direct channels require a callback; internal streams", () => {
  assert.equal(capabilitiesForProvider("internal").streaming_reply, true);
  assert.equal(capabilitiesForProvider("internal").callback_required, false);
  assert.equal(capabilitiesForProvider("cursor").callback_required, true);
  assert.equal(capabilitiesForProvider("codex").callback_required, true);
  assert.equal(capabilitiesForProvider("chatgpt").callback_required, true);
});

test("resolveCallbackOrigin prefers session codex over stated chatgpt", () => {
  assert.equal(resolveCallbackOrigin("chatgpt", "codex"), "codex");
  assert.equal(resolveCallbackOrigin("codex", "chatgpt"), "chatgpt");
  assert.equal(resolveCallbackOrigin(undefined, "codex"), "codex");
  assert.equal(resolveCallbackOrigin(null, null), "internal");
});

test("database route parser validates enums and handles absent routes", () => {
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
  assert.deepEqual(parseBrainRoute(row)?.config, { rounds: 2 });
  assert.equal(parseBrainRoute(row)?.route_type, "parliament");
  assert.equal(parseBrainRoute(null), null);
  assert.equal(parseBrainRoute({ ...row, route_type: "invalid" }), null);
  assert.equal(parseBrainRoute({ ...row, provider: "invalid" }), null);
  assert.deepEqual(parseBrainRoute({ ...row, config: null })?.config, {});
});

test("parliament context keeps existing metadata and serializable state", () => {
  const state = base();
  const context = { conversation_id: "conversation", nested: { keep: true } };
  const result = withParliamentContext(context, state);
  assert.deepEqual(result, { ...context, parliament: state });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.deepEqual(context, {
    conversation_id: "conversation",
    nested: { keep: true },
  });
  assert.deepEqual(withParliamentContext(null, state), { parliament: state });
});
