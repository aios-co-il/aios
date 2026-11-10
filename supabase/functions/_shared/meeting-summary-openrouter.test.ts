import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import {
  DEFAULT_MEETING_SUMMARY_MODEL,
  summarizeWithOpenRouter,
} from "./meeting-summary-openrouter.ts";
import { generateMeetingSummary } from "./meeting-summary.ts";
import { LONG_TRANSCRIPT_THRESHOLD } from "./meeting-summary-prompts.ts";

type Call = { url: string; body: Record<string, unknown> };

function fakeFetch(
  respond: (url: string) => Response,
  calls: Array<Call>,
): typeof fetch {
  return (input, init) => {
    const url = String(input);
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    return Promise.resolve(respond(url));
  };
}

function completion(content: string): Response {
  return Response.json({ choices: [{ message: { content } }] });
}

const longTranscript = Array.from(
  { length: 1200 },
  (_, i) => `[${i}] דובר: פרט ${i}`,
).join("\n");

Deno.test(
  "OpenRouter gets the whole long transcript in one request",
  async () => {
    const calls: Array<Call> = [];
    const summary = await summarizeWithOpenRouter(
      {
        apiKey: "or-key",
        tenantId: "tenant",
        transcript: longTranscript,
        recordingInfo: "",
        focusPrompt: "",
      },
      fakeFetch(() => completion("## תקציר מנהלים\nסיכום"), calls),
    );

    assertEquals(summary, "## תקציר מנהלים\nסיכום");
    assertEquals(calls.length, 1);
    assertEquals(calls[0].body.model, DEFAULT_MEETING_SUMMARY_MODEL);
    const messages = calls[0].body.messages as Array<{ content: string }>;
    assertStringIncludes(messages[1].content, "[1199] דובר: פרט 1199");
  },
);

Deno.test("an OpenRouter error names the model and status", async () => {
  await assertRejects(
    () =>
      summarizeWithOpenRouter(
        {
          apiKey: "or-key",
          tenantId: "tenant",
          transcript: "short",
          recordingInfo: "",
          focusPrompt: "",
        },
        fakeFetch(() => new Response("overloaded", { status: 529 }), []),
      ),
    Error,
    `${DEFAULT_MEETING_SUMMARY_MODEL} returned 529`,
  );
});

Deno.test(
  "a failed OpenRouter call falls back to the OpenAI path",
  async () => {
    const calls: Array<Call> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch(
      (url) =>
        url.includes("openrouter.ai")
          ? new Response("down", { status: 503 })
          : completion("סיכום מ-OpenAI"),
      calls,
    );
    try {
      const summary = await generateMeetingSummary(
        { openaiKey: "oa-key", openRouterKey: "or-key", tenantId: "tenant" },
        "short transcript",
        "",
        "",
      );
      assertEquals(summary, "סיכום מ-OpenAI");
      assertEquals(
        calls.map((c) => new URL(c.url).hostname),
        ["openrouter.ai", "api.openai.com"],
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  },
);

Deno.test(
  "without an OpenRouter key a long transcript keeps the chunked path",
  async () => {
    const calls: Array<Call> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch(() => completion("ממצאים"), calls);
    try {
      await generateMeetingSummary(
        { openaiKey: "oa-key", openRouterKey: "", tenantId: "tenant" },
        longTranscript.padEnd(LONG_TRANSCRIPT_THRESHOLD + 1, "\n"),
        "",
        "",
      );
      assertEquals(
        calls.every((c) => c.url.includes("api.openai.com")),
        true,
      );
      assertEquals(calls.length > 2, true);
    } finally {
      globalThis.fetch = realFetch;
    }
  },
);
