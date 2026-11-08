import { assertEquals } from "jsr:@std/assert@1";
import { answerFast } from "./answer.ts";

const target = { url: "https://llm.test/v1/chat", key: "k", model: "fast" };

/** A fetch that streams these chunks as Chat Completions SSE. */
function streaming(chunks: Array<unknown>, status = 200): typeof fetch {
  return () => {
    const body =
      chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") +
      "data: [DONE]\n\n";
    return Promise.resolve(new Response(body, { status }));
  };
}

const text = (content: string) => ({ choices: [{ delta: { content } }] });

/** Runs one fast answer and collects what reached the chat. */
async function run(fetchImpl: typeof fetch) {
  const shown: Array<string> = [];
  const answer = await answerFast({
    target,
    instructions: "sys",
    history: [],
    message: "היי",
    onText: (d) => shown.push(d),
    fetchImpl,
  });
  return { answer, shown: shown.join("") };
}

Deno.test("a short answer reaches the chat and is returned", async () => {
  const { answer, shown } = await run(
    streaming([text("היי! "), text("מה נשמע?")]),
  );
  assertEquals(answer.kind, "answered");
  assertEquals(shown, "היי! מה נשמע?");
});

Deno.test("a long answer streams as it arrives", async () => {
  const long = "זו תשובה ארוכה מספיק כדי לזרום";
  const { answer, shown } = await run(streaming([text(long), text(" ועוד")]));
  assertEquals(answer.kind, "answered");
  assertEquals(shown, `${long} ועוד`);
});

Deno.test("a call to the full brain hands over and shows nothing", async () => {
  const { answer, shown } = await run(
    streaming([
      text("רגע"),
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "c1",
                  function: { name: "full_brain", arguments: "{}" },
                },
              ],
            },
          },
        ],
      },
    ]),
  );
  assertEquals(answer, {
    kind: "escalate",
    reason: "handed_over",
    shown: false,
  });
  assertEquals(shown, "");
});

Deno.test("a failed request hands over", async () => {
  const { answer } = await run(streaming([], 429));
  assertEquals(answer, { kind: "escalate", reason: "http_429", shown: false });
  const thrown = await run(() => Promise.reject(new TypeError("network")));
  assertEquals(thrown.answer, {
    kind: "escalate",
    reason: "TypeError",
    shown: false,
  });
});
