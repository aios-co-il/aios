import { assert, assertStrictEquals } from "jsr:@std/assert@1";

import { sendCarmenReplyViaActionStep } from "./carmen.ts";

type SentCall = { url: string; body: Record<string, unknown> };

/** A PostgREST stand-in: the automation's send steps, and the group row. */
function stubSupabase(stepRows: unknown[], group: unknown = null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: stepRows }),
    maybeSingle: () => Promise.resolve({ data: group }),
  };
  return { from: () => builder };
}

// Under Deno the `Deno` global is a read-only property, so a plain assignment
// throws instead of stubbing it.
function defineGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

/** Runs `run` with Deno.env and fetch stubbed, recording each send. */
function withStubbedRuntime(run: (calls: SentCall[]) => Promise<void>) {
  const originalDeno = globalThis.Deno;
  const originalFetch = globalThis.fetch;
  const calls: SentCall[] = [];
  defineGlobal("Deno", {
    env: {
      get: (key: string) =>
        key === "SUPABASE_URL" ? "https://project.supabase.co" : "service-key",
    },
  });
  defineGlobal("fetch", (url: unknown, init: { body: string }) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return Promise.resolve({ ok: true, text: () => Promise.resolve("") });
  });
  return run(calls).finally(() => {
    defineGlobal("Deno", originalDeno);
    defineGlobal("fetch", originalFetch);
  });
}

const baseArgs = {
  automationId: "automation-1",
  tenantId: "tenant-1",
  connectionUserId: "user-1",
  phoneNumber: "972507677613",
  message: "שלום",
};

Deno.test(
  "a Carmen reply in a client group is stamped carmen and carries the group",
  async () => {
    await withStubbedRuntime(async (calls) => {
      const sent = await sendCarmenReplyViaActionStep({
        ...baseArgs,
        supabase: stubSupabase(
          [
            {
              action_type: "send_green_api_message",
              configuration: { green_api_integration_id: "green-1" },
            },
          ],
          { id: "group-uuid" },
        ),
        chatId: "120363416882903532@g.us",
        isGroup: true,
      });

      assertStrictEquals(sent, true);
      assert(calls[0].url.endsWith("/functions/v1/send-green-api-message"));
      assertStrictEquals(calls[0].body.sendKind, "carmen");
      assertStrictEquals(calls[0].body.groupId, "group-uuid");
      assertStrictEquals(calls[0].body.phoneNumber, undefined);
    });
  },
);

Deno.test(
  "a Carmen-line notification to a team member is a staff alert",
  async () => {
    await withStubbedRuntime(async (calls) => {
      const sent = await sendCarmenReplyViaActionStep({
        ...baseArgs,
        supabase: stubSupabase([
          {
            action_type: "send_manus_message",
            configuration: { integration_id: "manus-1" },
          },
        ]),
        chatId: "972507677613@c.us",
        isGroup: false,
        sendKind: "staff_alert",
      });

      assertStrictEquals(sent, true);
      assertStrictEquals(calls[0].body.sendKind, "staff_alert");
    });
  },
);
