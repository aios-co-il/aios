/** One tool call as Chat Completions returns it. */
export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

/** The assistant message and usage, rebuilt from a streamed Chat Completions response. */
export type StreamedCompletion = {
  message: { role: "assistant"; content: string; tool_calls?: Array<ToolCall> };
  usage: { prompt_tokens?: number; completion_tokens?: number } | null;
};

/** The parts of a streamed chunk this reader uses. */
type StreamChunk = {
  usage?: StreamedCompletion["usage"];
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
};

/** Providers whose OpenAI-compatible endpoint streams `delta` chunks the same way. */
const STREAMING_PROVIDERS = new Set(["openai", "google"]);

/**
 * Whether this model call can stream its text to the user. Only built-in providers: a
 * connected brain's reply is validated as a whole chat completion first.
 */
export function canStreamCompletion(llm: {
  provider?: string;
  connectionId?: string | null;
}): boolean {
  return !llm.connectionId && STREAMING_PROVIDERS.has(String(llm.provider));
}

/**
 * Reads a streamed Chat Completions body (`data: {...}` lines). Each text delta goes to
 * `onText` as it arrives, so Carmen's answer reaches the chat while she writes it; tool-call
 * fragments are joined by index into whole calls, as the non-streamed response has them.
 */
export async function readStreamedCompletion(
  body: ReadableStream<Uint8Array>,
  onText: (delta: string) => void,
): Promise<StreamedCompletion> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  let content = "";
  let usage: StreamedCompletion["usage"] = null;
  const calls: Array<ToolCall> = [];

  const handle = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      return;
    }
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") {
      return;
    }
    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(payload) as StreamChunk;
    } catch {
      console.warn("[AGENT] unreadable stream chunk skipped");
      return;
    }
    if (chunk?.usage) {
      usage = chunk.usage;
    }
    const delta = chunk?.choices?.[0]?.delta;
    if (typeof delta?.content === "string" && delta.content) {
      content += delta.content;
      onText(delta.content);
    }
    for (const part of delta?.tool_calls ?? []) {
      const index = typeof part.index === "number" ? part.index : calls.length;
      const call = (calls[index] ??= {
        id: "",
        type: "function",
        function: { name: "", arguments: "" },
      });
      if (part.id) {
        call.id = part.id;
      }
      if (part.function?.name) {
        call.function.name += part.function.name;
      }
      if (part.function?.arguments) {
        call.function.arguments += part.function.arguments;
      }
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handle);
  }
  handle(buffer + decoder.decode());

  const toolCalls = calls.filter((call) => call?.function.name);
  return {
    message: {
      role: "assistant",
      content,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    },
    usage,
  };
}
