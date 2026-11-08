import { assertEquals } from "jsr:@std/assert@1";
import {
  canStreamCompletion,
  messagesForProvider,
  readStreamedCompletion,
} from "./stream-completion.ts";

/** A body that delivers the given text in the given pieces, as a network would. */
function bodyOf(pieces: Array<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      pieces.forEach((p) => controller.enqueue(encoder.encode(p)));
      controller.close();
    },
  });
}

const line = (chunk: unknown) => `data: ${JSON.stringify(chunk)}\n\n`;

Deno.test(
  "text deltas reach the chat as they arrive and join into the answer",
  async () => {
    const seen: Array<string> = [];
    const sse =
      line({ choices: [{ delta: { content: "שלום " } }] }) +
      line({ choices: [{ delta: { content: "דוד" } }] }) +
      line({
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 3 },
      }) +
      "data: [DONE]\n\n";
    // Split mid-line, the way chunks really arrive.
    const result = await readStreamedCompletion(
      bodyOf([sse.slice(0, 25), sse.slice(25)]),
      (d) => seen.push(d),
    );
    assertEquals(seen, ["שלום ", "דוד"]);
    assertEquals(result.message, { role: "assistant", content: "שלום דוד" });
    assertEquals(result.usage, { prompt_tokens: 10, completion_tokens: 3 });
  },
);

Deno.test("tool-call fragments join into whole calls by index", async () => {
  const sse =
    line({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                function: { name: "list_", arguments: '{"sta' },
              },
            ],
          },
        },
      ],
    }) +
    line({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { name: "clients", arguments: 'tus":"active"}' },
              },
            ],
          },
        },
      ],
    }) +
    line({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 1,
                id: "call_2",
                function: { name: "list_tasks", arguments: "{}" },
              },
            ],
          },
        },
      ],
    });
  const result = await readStreamedCompletion(bodyOf([sse]), () => {});
  assertEquals(result.message.tool_calls, [
    {
      id: "call_1",
      type: "function",
      function: { name: "list_clients", arguments: '{"status":"active"}' },
    },
    {
      id: "call_2",
      type: "function",
      function: { name: "list_tasks", arguments: "{}" },
    },
  ]);
  assertEquals(result.message.content, "");
});

Deno.test(
  "a Gemini thought signature stays on its tool call for the next round",
  async () => {
    const signature = { google: { thought_signature: "sig-abc" } };
    const sse =
      line({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  function: { name: "list_leads", arguments: "" },
                  extra_content: signature,
                },
              ],
            },
          },
        ],
      }) +
      line({
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: "{}" } }],
            },
          },
        ],
      }) +
      "data: [DONE]\n\n";
    const result = await readStreamedCompletion(bodyOf([sse]), () => {});
    assertEquals(result.message.tool_calls, [
      {
        id: "call_1",
        type: "function",
        function: { name: "list_leads", arguments: "{}" },
        extra_content: signature,
      },
    ]);
  },
);

Deno.test("only built-in OpenAI and Google models stream", () => {
  assertEquals(canStreamCompletion({ provider: "openai" }), true);
  assertEquals(canStreamCompletion({ provider: "google" }), true);
  assertEquals(canStreamCompletion({ provider: "anthropic" }), false);
  assertEquals(
    canStreamCompletion({ provider: "openai", connectionId: "c1" }),
    false,
  );
});

Deno.test(
  "Gemini gets its tool-call extras back; other providers get the calls without them",
  () => {
    const call = {
      id: "call_1",
      type: "function" as const,
      function: { name: "list_leads", arguments: "{}" },
      extra_content: { google: { thought_signature: "sig" } },
    };
    const messages = [
      { role: "user", content: "כמה לידים?" },
      { role: "assistant", content: "", tool_calls: [call] },
    ];
    assertEquals(messagesForProvider(messages, "google"), messages);
    const plainCall = {
      id: call.id,
      type: call.type,
      function: call.function,
    };
    assertEquals(messagesForProvider(messages, "openai"), [
      messages[0],
      { role: "assistant", content: "", tool_calls: [plainCall] },
    ]);
  },
);
