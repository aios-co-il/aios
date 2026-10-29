import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  firstChoiceMessage,
  parseToolArguments,
  readChatCompletionMessage,
  readChatUsage,
  readErrorStack,
  readManusTask,
  readToolResult,
  toJson,
} from "./run-loop-contracts.ts";

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
          function: { name: "a", arguments: "{}", extra: true },
        },
      ],
    };
    const data = { choices: [{ message }], usage: { input_tokens: 3 } };
    assertStrictEquals(firstChoiceMessage(data), message);
    assertEquals(readChatCompletionMessage(message), message);
    assertEquals(
      readChatCompletionMessage({ content: "x", tool_calls: null }),
      {
        content: "x",
        tool_calls: null,
      },
    );
    assertStrictEquals(readChatCompletionMessage({ tool_calls: {} }), null);
    assertStrictEquals(
      readChatCompletionMessage({ tool_calls: [{ id: "c" }] }),
      null,
    );
    assertStrictEquals(
      readChatCompletionMessage({
        tool_calls: [{ id: 5, function: { name: "a" } }],
      }),
      null,
    );
    assertStrictEquals(readChatCompletionMessage("text"), null);
    assertStrictEquals(firstChoiceMessage({ choices: [] }), undefined);
    assertStrictEquals(firstChoiceMessage({ choices: "x" }), undefined);
    assertStrictEquals(firstChoiceMessage(null), undefined);
    assertEquals(readChatUsage(data), { input: 3, output: 0 });
    assertEquals(
      readChatUsage({
        usage: { prompt_tokens: 0, input_tokens: 9, completion_tokens: 4 },
      }),
      { input: 0, output: 4 },
    );
    assertEquals(readChatUsage({ usage: "x" }), { input: 0, output: 0 });
    assertStrictEquals(readChatUsage({}), null);
    assertStrictEquals(readChatUsage(null), null);
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
    assertEquals(parseToolArguments("[1]"), {});
    assertEquals(parseToolArguments({ query: "x" }), {});
  },
);

Deno.test("tool results expose the fields the run loop reads", () => {
  assertEquals(readToolResult("done"), {});
  assertEquals(readToolResult(null), {});
  assertEquals(readToolResult(["x"]), {});
  const view = readToolResult({
    success: true,
    whatsapp_digest: " d ",
    ui_action: { button: "x" },
    say_to_user: "hi",
    other: 1,
  });
  assertStrictEquals(view.success, true);
  assertStrictEquals(view.whatsapp_digest, " d ");
  assertEquals(view.ui_action, { button: "x" });
  assertStrictEquals(view.say_to_user, "hi");
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

Deno.test("Manus task responses expose their ids and links", () => {
  assertEquals(readManusTask({ task_id: "t1", task_url: "u", x: 1 }), {
    task_id: "t1",
    task_url: "u",
  });
  assertEquals(readManusTask("oops"), {});
});

Deno.test("error stacks are read from thrown objects only", () => {
  const error = new Error("boom");
  assertStrictEquals(readErrorStack(error), error.stack);
  assertStrictEquals(readErrorStack({ stack: "s" }), "s");
  assertStrictEquals(readErrorStack("boom"), undefined);
  assertStrictEquals(readErrorStack(null), undefined);
});
