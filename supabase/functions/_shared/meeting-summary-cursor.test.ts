import { assertEquals } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "./database.types.ts";
import { DEFAULT_BRAIN_ROUTE_SEEDS } from "./agent-channel/types.ts";
import { dispatchMeetingSummaryToCursor } from "./meeting-summary-cursor.ts";
Deno.test(
  "an owner query failure returns a dispatch error so summary fallback can run",
  async () => {
    const key = Deno.env.get("CURSOR_API_KEY");
    Deno.env.set("CURSOR_API_KEY", "test-key");
    try {
      const db = createClient<Database>("https://example.invalid", "key", {
        auth: { persistSession: false },
        global: {
          fetch: async (input) => {
            const url = new URL(
              input instanceof Request ? input.url : String(input),
            );
            if (url.pathname.endsWith("/user_roles")) {
              return new Response(
                JSON.stringify({
                  code: "42501",
                  message: "private database detail",
                }),
                {
                  status: 403,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (url.pathname.endsWith("/agent_brain_routes")) {
              return new Response(
                JSON.stringify(
                  DEFAULT_BRAIN_ROUTE_SEEDS.map((seed, index) => ({
                    ...seed,
                    id: String(index),
                    tenant_id: "t",
                    agent_id: null,
                    config: { ...seed.config, seats: ["codex"] },
                    active: true,
                  })),
                ),
                { headers: { "Content-Type": "application/json" } },
              );
            }
            throw new Error("unexpected request");
          },
        },
      });
      assertEquals(
        await dispatchMeetingSummaryToCursor(db, {
          tenantId: "t",
          recordingId: "r",
          transcript: "text",
          recordingInfo: "meeting",
          targetType: "client",
          targetId: "c",
          targetName: "Client",
        }),
        {
          ok: false,
          reason: "error",
          detail: "Meeting summary owner lookup failed",
        },
      );
    } finally {
      if (key === undefined) {
        Deno.env.delete("CURSOR_API_KEY");
      } else {
        Deno.env.set("CURSOR_API_KEY", key);
      }
    }
  },
);
