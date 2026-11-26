import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { SendResult } from "../_shared/agent-channel/types.ts";
import { recordDispatch } from "./dispatch-record.ts";

type RecordedUpdate = {
  table: string;
  metadata: Record<string, unknown>;
  filters: Record<string, string>;
};

/** A client stand-in that keeps each metadata update and answers with `error`. */
function recordingWriter(error: { message: string } | null = null) {
  const updates: Array<RecordedUpdate> = [];
  const client = {
    from: (table: string) => ({
      update: ({ metadata }: { metadata: Record<string, unknown> }) => ({
        eq: (tenantColumn: string, tenantId: string) => ({
          eq: (keyColumn: string, idempotencyKey: string) => {
            updates.push({
              table,
              metadata,
              filters: {
                [tenantColumn]: tenantId,
                [keyColumn]: idempotencyKey,
              },
            });
            return Promise.resolve({ error });
          },
        }),
      }),
    }),
  };
  // The one cast for the stand-in: it implements only the query this module runs.
  const sb = client as unknown as Pick<SupabaseClient, "from">;
  return { sb, updates };
}

const result: SendResult = {
  ok: true,
  kind: "cursor",
  conversation_id: "conv-1",
  status: "waiting_external",
  stream: false,
  accepted_message: "accepted",
  capabilities: {
    streaming_reply: false,
    async_reply: true,
    persistent_thread: true,
    attachments: true,
    tool_calls: false,
    callback_required: true,
    supports_cancel: false,
  },
};

const picture = {
  name: "invoice.png",
  url: "https://example.test/invoice.png",
  type: "image",
  path: "user-1/invoice.png",
};

describe("recordDispatch", () => {
  it("keeps the attachments and screen context the send stored on the message", async () => {
    const { sb, updates } = recordingWriter();
    const storedMetadata = {
      input_mode: "typed",
      delivery_mode: "text",
      attachments: [picture],
      context: { page: "/clients" },
    };

    await recordDispatch(sb, {
      tenantId: "tenant-1",
      idempotencyKey: "key-1",
      storedMetadata,
      result,
    });

    assertEquals(updates, [
      {
        table: "ai_conversation_messages",
        metadata: { ...storedMetadata, dispatch: result },
        filters: { tenant_id: "tenant-1", idempotency_key: "key-1" },
      },
    ]);
  });

  it("replaces the outcome of an earlier dispatch of the same message", async () => {
    const { sb, updates } = recordingWriter();

    await recordDispatch(sb, {
      tenantId: "tenant-1",
      idempotencyKey: "key-1",
      storedMetadata: { input_mode: "typed", dispatch: { ok: false } },
      result,
    });

    assertEquals(updates[0].metadata.dispatch, result);
  });

  it("finishes the send when the outcome cannot be stored", async () => {
    const { sb, updates } = recordingWriter({ message: "write refused" });

    await recordDispatch(sb, {
      tenantId: "tenant-1",
      idempotencyKey: "key-1",
      storedMetadata: {},
      result,
    });

    assertEquals(updates.length, 1);
  });
});
