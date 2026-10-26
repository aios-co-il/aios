import assert from "node:assert/strict";
import test from "node:test";
import { readWaNotifyTarget } from "./wa-notify.ts";
import {
  firstChoiceMessage,
  isChatCompletionMessage,
  parseToolArguments,
  readChatUsage,
  readToolResult,
  toJson,
} from "./run-loop-contracts.ts";
import {
  embeddedName,
  parseRunAgentRequest,
  readConversationTurns,
} from "./run-request.ts";

test("request body keeps typed fields and treats wrongly typed values as absent", () => {
  const body = parseRunAgentRequest({
    agent_id: 42,
    command_text: "hello",
    temperature: 0.4,
    tenant_id: "tenant-1",
    lead_data: { phone: "0501234567", channel: "whatsapp_private" },
    task_skills: ["copywriter", 7, "seo"],
    conversation_history: [{ role: "user", content: "hi" }],
    pin_skills_only: true,
    stream: "yes",
    wa_notify: {
      surface: "whatsapp",
      tenant_id: "tenant-1",
      automation_id: null,
      connection_user_id: "u1",
      chat_id: "972@c.us",
      phone_number: null,
      is_group: false,
    },
    carmen_automation: ["not", "an", "object"],
    context_metadata: { source: "command_center_sidebar" },
  });
  assert.equal(body.agent_id, undefined);
  assert.equal(body.command_text, "hello");
  assert.equal(body.temperature, 0.4);
  assert.equal(body.tenant_id, "tenant-1");
  assert.deepEqual(body.lead_data, {
    phone: "0501234567",
    channel: "whatsapp_private",
  });
  assert.deepEqual(body.task_skills, ["copywriter", "seo"]);
  assert.deepEqual(body.conversation_history, [
    { role: "user", content: "hi" },
  ]);
  assert.equal(body.pin_skills_only, true);
  assert.equal(body.stream, undefined);
  assert.equal(body.wa_notify?.chat_id, "972@c.us");
  assert.equal(body.wa_notify?.is_group, false);
  assert.equal(body.carmen_automation, undefined);
  assert.deepEqual(body.context_metadata, { source: "command_center_sidebar" });
  assert.equal(body.direct_tool, undefined);
});

test("non-object bodies parse as empty and any truthy direct_tool is a direct call", () => {
  assert.deepEqual(
    Object.values(parseRunAgentRequest(null)).filter((v) => v !== undefined),
    [],
  );
  assert.deepEqual(parseRunAgentRequest({ direct_tool: true }).direct_tool, {
    action: undefined,
    caller: undefined,
    approval_id: undefined,
    approved_by: undefined,
    name: undefined,
    args: undefined,
  });
  assert.equal(parseRunAgentRequest({ direct_tool: 0 }).direct_tool, undefined);
  const call = parseRunAgentRequest({
    direct_tool: { action: "call", name: "list_clients", args: { q: "a" } },
  }).direct_tool;
  assert.equal(call?.action, "call");
  assert.deepEqual(call?.args, { q: "a" });
});

test("conversation turns keep user/assistant entries and stringify content", () => {
  assert.deepEqual(
    readConversationTurns([
      { role: "user", content: "hi" },
      { role: "system", content: "x" },
      null,
      { role: "assistant", content: 5 },
      { role: "assistant" },
    ]),
    [
      { role: "user", content: "hi" },
      { role: "assistant", content: "5" },
      { role: "assistant", content: "" },
    ],
  );
  assert.deepEqual(readConversationTurns({ role: "user" }), []);
});

test("embedded names are read only from objects with a string name", () => {
  assert.equal(embeddedName({ name: "Acme" }), "Acme");
  assert.equal(embeddedName(null), undefined);
  assert.equal(embeddedName("column 'type' does not exist"), undefined);
});

test("chat completion messages keep provider fields and reject malformed tool calls", () => {
  const message = {
    role: "assistant",
    content: null,
    reasoning_content: "kept",
    tool_calls: [
      { id: "c1", type: "function", function: { name: "a", arguments: "{}" } },
    ],
  };
  const data = { choices: [{ message }], usage: { input_tokens: 3 } };
  assert.equal(firstChoiceMessage(data), message);
  assert.equal(isChatCompletionMessage(message), true);
  assert.equal(
    isChatCompletionMessage({ content: "x", tool_calls: null }),
    true,
  );
  assert.equal(isChatCompletionMessage({ tool_calls: {} }), false);
  assert.equal(isChatCompletionMessage({ tool_calls: [{ id: "c" }] }), false);
  assert.equal(isChatCompletionMessage("text"), false);
  assert.equal(firstChoiceMessage({ choices: [] }), undefined);
  assert.equal(firstChoiceMessage(null), undefined);
  assert.deepEqual(readChatUsage(data), { input: 3, output: 0 });
  assert.deepEqual(
    readChatUsage({
      usage: { prompt_tokens: 0, input_tokens: 9, completion_tokens: 4 },
    }),
    { input: 0, output: 4 },
  );
  assert.equal(readChatUsage({}), null);
});

test("tool arguments parse JSON objects and fall back to an empty object", () => {
  assert.deepEqual(parseToolArguments('{"query":"x","limit":3}'), {
    query: "x",
    limit: 3,
  });
  assert.deepEqual(parseToolArguments(undefined), {});
  assert.deepEqual(parseToolArguments(""), {});
  assert.deepEqual(parseToolArguments("{bad"), {});
  assert.deepEqual(parseToolArguments({ query: "x" }), {});
});

test("tool results expose the fields the run loop reads", () => {
  assert.deepEqual(readToolResult("done"), {});
  assert.deepEqual(readToolResult(null), {});
  const view = readToolResult({
    success: true,
    whatsapp_digest: " d ",
    ui_action: { button: "x" },
  });
  assert.equal(view.success, true);
  assert.equal(view.whatsapp_digest, " d ");
  assert.deepEqual(view.ui_action, { button: "x" });
  assert.equal(view.error, undefined);
});

test("tool results serialize for jsonb exactly as JSON.stringify would", () => {
  assert.equal(toJson(undefined), undefined);
  assert.deepEqual(toJson({ a: 1, b: undefined, c: [1, undefined] }), {
    a: 1,
    c: [1, null],
  });
  assert.equal(toJson(new Date(0)), "1970-01-01T00:00:00.000Z");
});

test("readWaNotifyTarget keeps complete WhatsApp targets and drops malformed ones", () => {
  const target = {
    surface: "whatsapp",
    tenant_id: "t1",
    automation_id: null,
    connection_user_id: "u1",
    chat_id: "123@g.us",
    phone_number: null,
    is_group: true,
  };
  assert.deepEqual(readWaNotifyTarget(target), target);
  assert.equal(readWaNotifyTarget(undefined), undefined);
  assert.equal(readWaNotifyTarget(null), null);
  assert.equal(readWaNotifyTarget({ ...target, surface: "email" }), null);
  assert.equal(readWaNotifyTarget({ ...target, chat_id: 5 }), null);
  assert.equal(readWaNotifyTarget(["x"]), null);
});
