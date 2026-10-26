import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { sendCarmenReplyViaActionStep } from "./carmen.ts";

// Minimal stand-in for the PostgREST builder: every filter returns `this`, and the
// builder resolves to the rows it was seeded with.
function stubSupabase(stepRows, group = null) {
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
function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function withStubbedRuntime(run) {
  const originalDeno = globalThis.Deno;
  const originalFetch = globalThis.fetch;
  const calls = [];
  defineGlobal("Deno", {
    env: {
      get: (key) =>
        key === "SUPABASE_URL" ? "https://project.supabase.co" : "service-key",
    },
  });
  defineGlobal("fetch", async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, text: async () => "" };
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

Deno.test("a Meta action step never sends to a group", async () => {
  await withStubbedRuntime(async (calls) => {
    const sent = await sendCarmenReplyViaActionStep({
      ...baseArgs,
      supabase: stubSupabase([
        {
          action_type: "send_meta_whatsapp_message",
          configuration: { meta_whatsapp_integration_id: "meta-1" },
        },
      ]),
      chatId: "120363416882903532@g.us",
      isGroup: true,
    });

    assertStrictEquals(sent, false);
    assertEquals(calls, []);
  });
});

Deno.test(
  "a Meta action step dispatches a 1:1 reply to send-meta-whatsapp-message",
  async () => {
    await withStubbedRuntime(async (calls) => {
      const sent = await sendCarmenReplyViaActionStep({
        ...baseArgs,
        supabase: stubSupabase([
          {
            action_type: "send_meta_whatsapp_message",
            configuration: { meta_whatsapp_integration_id: "meta-1" },
          },
        ]),
        chatId: "972507677613",
        isGroup: false,
      });

      assertStrictEquals(sent, true);
      assertStrictEquals(calls.length, 1);
      assert(calls[0].url.endsWith("/functions/v1/send-meta-whatsapp-message"));
      assertEquals(calls[0].body, {
        tenantId: "tenant-1",
        senderUserId: "user-1",
        message: "שלום",
        // Carmen's send (client card auto-log, AIO-242).
        sendKind: "carmen",
        integrationId: "meta-1",
        phoneNumber: "972507677613",
      });
    });
  },
);

Deno.test(
  "a Manus action step still routes to send-manus-wa-message",
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
        chatId: "972507677613",
        isGroup: false,
      });

      assertStrictEquals(sent, true);
      assert(calls[0].url.endsWith("/functions/v1/send-manus-wa-message"));
      assertStrictEquals(calls[0].body.integrationId, "manus-1");
    });
  },
);

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
