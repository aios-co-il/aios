import { assert, assertEquals } from "jsr:@std/assert@1";
import { createAgentStream } from "./stream.ts";
import type {
  AgentStreamDependencies,
  AgentStreamInput,
} from "./stream-types.ts";
import type { BackgroundRuntime } from "../background-runtime.ts";
import { executorClient } from "../executors/test-client.ts";

/** A chat with the same idempotent reply key used by the saved-reply path. */
function input(): AgentStreamInput {
  return {
    req: new Request("https://example.test/run", {
      headers: { origin: "https://app.example" },
    }),
    bodyJson: { command_text: "hello", reply_key: "reply-key-123" },
    surface: "internal_chat",
    authKind: "user",
  };
}

/** No database call is made by these transport-only fixtures. */
async function ignoreSave() {}

/** Supplies a query client only as an opaque argument to the replaced save function. */
function dependencies(
  run: AgentStreamDependencies["handleRunAgent"],
  save: AgentStreamDependencies["saveCarmenReply"] = ignoreSave,
): AgentStreamDependencies {
  const fixture = executorClient([]);
  return {
    handleRunAgent: run,
    createClient: () => fixture.context.supabase,
    saveCarmenReply: save,
  };
}

/** Decodes the SSE wire contract, excluding the empty frame after the final delimiter. */
function events(text: string) {
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => JSON.parse(frame.slice("data: ".length)));
}

Deno.test(
  "SSE preserves token/done order and forwards the request origin",
  async () => {
    const response = createAgentStream(
      input(),
      dependencies(async (...args) => {
        assertEquals(args[4], {
          authKind: "user",
          origin: "https://app.example",
        });
        args[2]?.({ type: "token", content: "hello" });
        return new Response(
          JSON.stringify({
            success: true,
            output: "hello",
            tools_used: ["read"],
          }),
        );
      }),
    );
    assertEquals(
      response.headers.get("Content-Type"),
      "text/event-stream; charset=utf-8",
    );
    assertEquals(
      response.headers.get("Cache-Control"),
      "no-cache, no-transform",
    );
    assertEquals(events(await response.text()), [
      { type: "token", content: "hello" },
      { type: "done", success: true, output: "hello", tools_used: ["read"] },
    ]);
  },
);

Deno.test(
  "disconnecting the SSE reader keeps the turn and saved reply alive",
  async () => {
    const gate = Promise.withResolvers<void>();
    const background: Array<Promise<unknown>> = [];
    const saved: Array<{
      conversationId: string;
      content: string;
      replyKey: string | null;
    }> = [];
    const globals = globalThis as typeof globalThis & {
      EdgeRuntime?: BackgroundRuntime;
    };
    const previous = globals.EdgeRuntime;
    globals.EdgeRuntime = { waitUntil: (work) => background.push(work) };
    try {
      const response = createAgentStream(
        input(),
        dependencies(
          async (...args) => {
            args[2]?.({
              type: "conversation_id",
              id: "22222222-2222-4222-8222-222222222222",
            });
            args[2]?.({ type: "token", content: "first" });
            await gate.promise;
            args[2]?.({ type: "token", content: " second" });
            return new Response(
              JSON.stringify({ success: true, output: "fallback" }),
            );
          },
          async (...args) => {
            saved.push(args[1]);
          },
        ),
      );
      assert(response.body);
      const reader = response.body.getReader();
      assertEquals((await reader.read()).done, false);
      const cancelled = reader.cancel();
      gate.resolve();
      await cancelled;
      assertEquals(background.length, 1);
      await Promise.all(background);
      assertEquals(saved, [
        {
          conversationId: "22222222-2222-4222-8222-222222222222",
          content: "first second",
          replyKey: "reply-key-123",
        },
      ]);
    } finally {
      gate.resolve();
      if (previous === undefined) {
        delete globals.EdgeRuntime;
      } else {
        globals.EdgeRuntime = previous;
      }
    }
  },
);

Deno.test(
  "a failed JSON run yields one failed done event, while a thrown run yields error then done",
  async () => {
    const failed = createAgentStream(
      input(),
      dependencies(
        async () =>
          new Response(
            JSON.stringify({ success: false, output: "", error: "denied" }),
          ),
      ),
    );
    assertEquals(events(await failed.text()), [
      { type: "done", success: false, output: "", error: "denied" },
    ]);
    const thrown = createAgentStream(
      input(),
      dependencies(async () => {
        throw new Error("down");
      }),
    );
    assertEquals(events(await thrown.text()), [
      { type: "error", error: "down" },
      { type: "done", success: false, error: "down" },
    ]);
  },
);
