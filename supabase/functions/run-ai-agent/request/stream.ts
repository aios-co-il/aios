import type { BackgroundRuntime } from "../background-runtime.ts";
declare const EdgeRuntime: BackgroundRuntime;
import type { FinalRunPayload } from "./stream-types.ts";
import { corsHeaders } from "../runtime.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { SUPABASE_URL } from "../runtime.ts";
import { SUPABASE_SERVICE_ROLE_KEY } from "../runtime.ts";

import { handleRunAgent } from "../run/handle.ts";
import { createReplyRecorder } from "../../_shared/carmen/background-reply.ts";
import { parseReplyKey } from "../../_shared/carmen/background-reply.ts";
import { saveCarmenReply } from "../../_shared/carmen/background-reply.ts";
import type {
  AgentStreamInput,
  AgentStreamDependencies,
} from "./stream-types.ts";

/** Continues the turn and reply recording even when the SSE writer disconnects. */
export function createAgentStream(
  input: AgentStreamInput,
  dependencies: AgentStreamDependencies = {
    createClient,
    handleRunAgent,
    saveCarmenReply,
  },
): Response {
  const { req, bodyJson, surface, authKind, brainEngine, internalTail } = input;

  // Streaming mode: AIOS-compatible SSE.
  // Events emitted: {type:'tool_call',tool,args}, {type:'token',content}, {type:'done',...}
  // The turn keeps running after the client disconnects (closed chat panel,
  // reloaded tab), and the server saves the answer (_shared/carmen/background-reply).
  const enc = new TextEncoder();

  const recorder = createReplyRecorder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      /** Retains the original emit helper. */
      function emit(obj: unknown) {
        recorder.observe(obj as Parameters<typeof recorder.observe>[0]);
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* client gone: keep working, the reply is saved below */
        }
      }
      const turn = (async () => {
        let final: FinalRunPayload = {};
        try {
          const resp = await dependencies.handleRunAgent(
            bodyJson,
            surface,
            emit,
            brainEngine,
            {
              authKind: authKind,
              origin: req.headers.get("origin"),
            },
            internalTail,
          );
          try {
            final = await resp.json();
          } catch {
            /* ignore */
          }
          emit({
            type: "done",
            success: final.success !== false,
            output: final.output,
            tools_used: final.tools_used,
            error: final.error,
          });
        } catch (e) {
          emit({
            type: "error",
            error: (e as Error | null)?.message || String(e),
          });
          emit({
            type: "done",
            success: false,
            error: (e as Error | null)?.message || String(e),
          });
        } finally {
          try {
            controller.close();
          } catch {
            /* ignore */
          }
        }
        // Only the chat that sent a reply_key gets its answer saved here; the
        // other streaming callers keep saving their own replies.
        const replyKey = parseReplyKey(bodyJson.reply_key);
        if (
          surface === "internal_chat" &&
          replyKey &&
          recorder.conversationId
        ) {
          await dependencies
            .saveCarmenReply(
              dependencies.createClient(
                SUPABASE_URL,
                SUPABASE_SERVICE_ROLE_KEY,
              ),
              {
                conversationId: recorder.conversationId,
                content: recorder.reply(final.output),
                replyKey,
              },
            )
            .catch((e) => console.error("[carmen] reply save failed:", e));
        }
      })();
      if (typeof EdgeRuntime !== "undefined") {
        EdgeRuntime.waitUntil(turn);
      }
      await turn;
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
