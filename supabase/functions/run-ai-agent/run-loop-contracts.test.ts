import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  readWaChatScope,
  readWaNotifyTarget,
  type WaNotifyTarget,
} from "./wa-notify.ts";
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
import {
  argBoolean,
  argEnum,
  argNullableNumber,
  argNullableString,
  argNumber,
  argObject,
  argString,
  argStringArray,
  requireArgString,
} from "./tool-args.ts";

Deno.test(
  "request body keeps typed fields and treats wrongly typed values as absent",
  () => {
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
    assertStrictEquals(body.agent_id, undefined);
    assertStrictEquals(body.command_text, "hello");
    assertStrictEquals(body.temperature, 0.4);
    assertStrictEquals(body.tenant_id, "tenant-1");
    assertEquals(body.lead_data, {
      phone: "0501234567",
      channel: "whatsapp_private",
    });
    assertEquals(body.task_skills, ["copywriter", "seo"]);
    assertEquals(body.conversation_history, [{ role: "user", content: "hi" }]);
    assertStrictEquals(body.pin_skills_only, true);
    assertStrictEquals(body.stream, undefined);
    assertStrictEquals(body.wa_notify?.chat_id, "972@c.us");
    assertStrictEquals(body.wa_notify?.is_group, false);
    assertStrictEquals(body.carmen_automation, undefined);
    assertEquals(body.context_metadata, { source: "command_center_sidebar" });
    assertStrictEquals(body.direct_tool, undefined);
  },
);

Deno.test(
  "non-object bodies parse as empty and any truthy direct_tool is a direct call",
  () => {
    assertEquals(
      Object.values(parseRunAgentRequest(null)).filter((v) => v !== undefined),
      [],
    );
    assertEquals(parseRunAgentRequest({ direct_tool: true }).direct_tool, {
      action: undefined,
      caller: undefined,
      approval_id: undefined,
      approved_by: undefined,
      name: undefined,
      args: undefined,
    });
    assertStrictEquals(
      parseRunAgentRequest({ direct_tool: 0 }).direct_tool,
      undefined,
    );
    const call = parseRunAgentRequest({
      direct_tool: { action: "call", name: "list_clients", args: { q: "a" } },
    }).direct_tool;
    assertStrictEquals(call?.action, "call");
    assertEquals(call?.args, { q: "a" });
  },
);

Deno.test(
  "conversation turns keep user/assistant entries and stringify content",
  () => {
    assertEquals(
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
    assertEquals(readConversationTurns({ role: "user" }), []);
  },
);

Deno.test(
  "embedded names are read only from objects with a string name",
  () => {
    assertStrictEquals(embeddedName({ name: "Acme" }), "Acme");
    assertStrictEquals(embeddedName(null), undefined);
    assertStrictEquals(embeddedName("column 'type' does not exist"), undefined);
  },
);

Deno.test(
  "chat completion messages keep provider fields and reject malformed tool calls",
  () => {
    const message = {
      role: "assistant",
      content: null,
      reasoning_content: "kept",
      tool_calls: [
        {
          id: "c1",
          type: "function",
          function: { name: "a", arguments: "{}" },
        },
      ],
    };
    const data = { choices: [{ message }], usage: { input_tokens: 3 } };
    assertStrictEquals(firstChoiceMessage(data), message);
    assertStrictEquals(isChatCompletionMessage(message), true);
    assertStrictEquals(
      isChatCompletionMessage({ content: "x", tool_calls: null }),
      true,
    );
    assertStrictEquals(isChatCompletionMessage({ tool_calls: {} }), false);
    assertStrictEquals(
      isChatCompletionMessage({ tool_calls: [{ id: "c" }] }),
      false,
    );
    assertStrictEquals(isChatCompletionMessage("text"), false);
    assertStrictEquals(firstChoiceMessage({ choices: [] }), undefined);
    assertStrictEquals(firstChoiceMessage(null), undefined);
    assertEquals(readChatUsage(data), { input: 3, output: 0 });
    assertEquals(
      readChatUsage({
        usage: { prompt_tokens: 0, input_tokens: 9, completion_tokens: 4 },
      }),
      { input: 0, output: 4 },
    );
    assertStrictEquals(readChatUsage({}), null);
  },
);

Deno.test(
  "tool arguments parse JSON objects and fall back to an empty object",
  () => {
    assertEquals(parseToolArguments('{"query":"x","limit":3}'), {
      query: "x",
      limit: 3,
    });
    assertEquals(parseToolArguments(undefined), {});
    assertEquals(parseToolArguments(""), {});
    assertEquals(parseToolArguments("{bad"), {});
    assertEquals(parseToolArguments({ query: "x" }), {});
  },
);

Deno.test("tool results expose the fields the run loop reads", () => {
  assertEquals(readToolResult("done"), {});
  assertEquals(readToolResult(null), {});
  const view = readToolResult({
    success: true,
    whatsapp_digest: " d ",
    ui_action: { button: "x" },
  });
  assertStrictEquals(view.success, true);
  assertStrictEquals(view.whatsapp_digest, " d ");
  assertEquals(view.ui_action, { button: "x" });
  assertStrictEquals(view.error, undefined);
});

Deno.test(
  "tool results serialize for jsonb exactly as JSON.stringify would",
  () => {
    assertStrictEquals(toJson(undefined), undefined);
    assertEquals(toJson({ a: 1, b: undefined, c: [1, undefined] }), {
      a: 1,
      c: [1, null],
    });
    assertStrictEquals(toJson(new Date(0)), "1970-01-01T00:00:00.000Z");
  },
);

Deno.test(
  "readWaNotifyTarget keeps complete WhatsApp targets and drops malformed ones",
  () => {
    const target: WaNotifyTarget = {
      surface: "whatsapp",
      tenant_id: "t1",
      automation_id: null,
      connection_user_id: "u1",
      chat_id: "123@g.us",
      phone_number: null,
      is_group: true,
    };
    assertEquals(readWaNotifyTarget(target), target);
    assertStrictEquals(readWaNotifyTarget(undefined), undefined);
    assertStrictEquals(readWaNotifyTarget(null), null);
    assertStrictEquals(
      readWaNotifyTarget({ ...target, surface: "email" }),
      null,
    );
    assertStrictEquals(readWaNotifyTarget({ ...target, chat_id: 5 }), null);
    assertStrictEquals(readWaNotifyTarget(["x"]), null);
  },
);

Deno.test(
  "a partial WhatsApp target keeps its chat scope while delivery is dropped",
  () => {
    const body = parseRunAgentRequest({
      wa_notify: { surface: "whatsapp", chat_id: "972501234567@c.us" },
    });
    assertStrictEquals(body.wa_notify, null);
    assertEquals(body.wa_chat_scope, {
      chat_id: "972501234567@c.us",
      is_group: null,
    });
  },
);

Deno.test(
  "readWaChatScope marks WhatsApp requests without a usable chat id as unknown",
  () => {
    assertStrictEquals(readWaChatScope(undefined), null);
    assertStrictEquals(readWaChatScope(null), null);
    assertEquals(readWaChatScope({ surface: "whatsapp" }), {
      chat_id: null,
      is_group: null,
    });
    assertEquals(readWaChatScope({ chat_id: 972501234567, is_group: false }), {
      chat_id: "972501234567",
      is_group: false,
    });
    assertStrictEquals(parseRunAgentRequest({}).wa_chat_scope, undefined);
  },
);

const toolArgs = {
  id: "c1",
  count: 7,
  quoted: " 12 ",
  blank: "",
  word: "abc",
  flag: true,
  cleared: null,
  tags: ["a", 2, "b"],
  nested: { k: 1 },
  list: [1],
};

Deno.test(
  "tool args read strings and numbers the way the old coercions did",
  () => {
    assertStrictEquals(argString(toolArgs, "id"), "c1");
    assertStrictEquals(argString(toolArgs, "count"), "7");
    assertStrictEquals(argString(toolArgs, "flag"), undefined);
    assertStrictEquals(argString(toolArgs, "missing"), undefined);
    assertStrictEquals(requireArgString(toolArgs, "blank"), "");
    assertThrows(
      () => requireArgString(toolArgs, "nested"),
      Error,
      "nested is required",
    );
    assertStrictEquals(argNumber(toolArgs, "count"), 7);
    assertStrictEquals(argNumber(toolArgs, "quoted"), 12);
    assertStrictEquals(argNumber(toolArgs, "blank"), undefined);
    assertStrictEquals(argNumber(toolArgs, "word"), undefined);
    assertStrictEquals(argNullableString(toolArgs, "cleared"), null);
    assertStrictEquals(argNullableNumber(toolArgs, "cleared"), null);
    assertStrictEquals(argNullableString(toolArgs, "missing"), undefined);
  },
);

Deno.test("tool args narrow arrays, objects and enums", () => {
  assertEquals(argStringArray(toolArgs, "tags"), ["a", "b"]);
  assertStrictEquals(argStringArray(toolArgs, "id"), undefined);
  assertEquals(argObject(toolArgs, "nested"), { k: 1 });
  assertStrictEquals(argObject(toolArgs, "list"), undefined);
  assertStrictEquals(argObject(toolArgs, "cleared"), undefined);
  const statuses = ["open", "done"] as const;
  assertStrictEquals(argEnum({ s: "done" }, "s", statuses), "done");
  assertStrictEquals(argEnum({ s: "" }, "s", statuses), undefined);
  assertStrictEquals(argEnum({}, "s", statuses), undefined);
  assertThrows(() => argEnum({ s: "x" }, "s", statuses), Error, "open, done");
});

Deno.test(
  "argBoolean accepts booleans and quoted booleans and rejects other values",
  () => {
    assertStrictEquals(argBoolean({ on: true }, "on"), true);
    assertStrictEquals(argBoolean({ on: false }, "on"), false);
    assertStrictEquals(argBoolean({ on: "true" }, "on"), true);
    assertStrictEquals(argBoolean({ on: "false" }, "on"), false);
    assertStrictEquals(argBoolean({}, "on"), undefined);
    assertThrows(
      () => argBoolean({ on: "yes" }, "on"),
      Error,
      "on must be boolean",
    );
    assertThrows(
      () => argBoolean({ on: 1 }, "on"),
      Error,
      "on must be boolean",
    );
    assertThrows(
      () => argBoolean({ on: null }, "on"),
      Error,
      "on must be boolean",
    );
  },
);
