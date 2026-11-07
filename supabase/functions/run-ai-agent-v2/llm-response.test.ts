import { assertEquals } from "jsr:@std/assert@1";
import { readChatCompletion, readToolCall } from "./llm-response.ts";

Deno.test("readChatCompletion reads the first message and usage", () => {
  const call = { id: "c1", function: { name: "t", arguments: "{}" } };
  assertEquals(
    readChatCompletion({
      choices: [{ message: { content: "hi", tool_calls: [call] } }],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    }),
    {
      message: { content: "hi", tool_calls: [call] },
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    },
  );
});

Deno.test("readChatCompletion defaults malformed parts", () => {
  const empty = {
    message: { content: null, tool_calls: [] },
    usage: { prompt_tokens: 0, completion_tokens: 0 },
  };
  for (const raw of [null, "x", [], {}, { choices: "x", usage: 5 }]) {
    assertEquals(readChatCompletion(raw), empty);
  }
  assertEquals(
    readChatCompletion({
      choices: [{ message: { content: ["a"], tool_calls: "x" } }],
      usage: { prompt_tokens: "3" },
    }),
    empty,
  );
});

Deno.test("readToolCall reads the function name and arguments", () => {
  assertEquals(
    readToolCall({
      id: "call_1",
      function: { name: "search", arguments: '{"q":1}' },
    }),
    { id: "call_1", name: "search", arguments: '{"q":1}' },
  );
});

Deno.test("readToolCall defaults missing arguments to {}", () => {
  assertEquals(readToolCall({ function: { name: "t", arguments: "" } }), {
    id: undefined,
    name: "t",
    arguments: "{}",
  });
  assertEquals(readToolCall({ function: { name: "t", arguments: { a: 1 } } }), {
    id: undefined,
    name: "t",
    arguments: "{}",
  });
  const empty = { id: undefined, name: undefined, arguments: "{}" };
  assertEquals(readToolCall(null), empty);
  assertEquals(readToolCall({ function: null }), empty);
});
