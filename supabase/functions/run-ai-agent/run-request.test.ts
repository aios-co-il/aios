import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  embeddedName,
  parseRunAgentRequest,
  readConversationTurns,
  readHistoryMessages,
} from "./run-request.ts";

Deno.test(
  "request body keeps typed fields and treats wrongly typed values as absent",
  () => {
    const body = parseRunAgentRequest({
      agent_id: 42,
      command_text: "hello",
      temperature: 0.4,
      tenant_id: "tenant-1",
      lead_data: { phone: "0501234567", channel: "whatsapp_private" },
      task_skills: ["copywriter", 7, "seo"],
      conversation_history: [{ role: "user", content: "hi" }],
      pin_skills_only: true,
      stream: "yes",
      wa_notify: {
        surface: "whatsapp",
        tenant_id: "tenant-1",
        automation_id: null,
        connection_user_id: "u1",
        chat_id: "972@c.us",
        phone_number: null,
        is_group: false,
      },
      carmen_automation: ["not", "an", "object"],
      context_metadata: { source: "command_center_sidebar" },
      workshop_item_id: "item-1",
    });
    assertStrictEquals(body.agent_id, undefined);
    assertStrictEquals(body.command_text, "hello");
    assertStrictEquals(body.temperature, 0.4);
    assertStrictEquals(body.tenant_id, "tenant-1");
    assertEquals(body.lead_data, {
      phone: "0501234567",
      channel: "whatsapp_private",
    });
    assertEquals(body.task_skills, ["copywriter", "seo"]);
    assertEquals(body.conversation_history, [{ role: "user", content: "hi" }]);
    assertStrictEquals(body.pin_skills_only, true);
    assertStrictEquals(body.stream, undefined);
    assertStrictEquals(body.wa_notify?.chat_id, "972@c.us");
    assertStrictEquals(body.wa_notify?.is_group, false);
    assertStrictEquals(body.carmen_automation, undefined);
    assertEquals(body.context_metadata, { source: "command_center_sidebar" });
    assertStrictEquals(body.direct_tool, undefined);
    assertStrictEquals(body.workshop_item_id, "item-1");
  },
);

Deno.test("a partial WhatsApp target is kept as sent", () => {
  const body = parseRunAgentRequest({
    wa_notify: { surface: "whatsapp", chat_id: "972501234567@c.us", x: 1 },
  });
  assertEquals(body.wa_notify, {
    surface: "whatsapp",
    chat_id: "972501234567@c.us",
    x: 1,
  });
  assertStrictEquals(
    parseRunAgentRequest({ wa_notify: "x" }).wa_notify,
    undefined,
  );
  assertStrictEquals(parseRunAgentRequest({ wa_notify: null }).wa_notify, null);
});

Deno.test(
  "a truthy automation_id of any type still marks an automation run",
  () => {
    assertStrictEquals(
      parseRunAgentRequest({ automation_id: "a1" }).automation_id,
      "a1",
    );
    assertStrictEquals(
      parseRunAgentRequest({ automation_id: 7 }).automation_id,
      "7",
    );
    for (const value of ["", 0, false, null, undefined]) {
      assertStrictEquals(
        parseRunAgentRequest({ automation_id: value }).automation_id,
        undefined,
      );
    }
  },
);

Deno.test(
  "non-object bodies parse as empty and any truthy direct_tool is a direct call",
  () => {
    for (const value of [null, "x", [1]]) {
      assertEquals(parseRunAgentRequest(value), {});
    }
    assertEquals(parseRunAgentRequest({ direct_tool: true }).direct_tool, {
      args: {},
    });
    assertStrictEquals(
      parseRunAgentRequest({ direct_tool: 0 }).direct_tool,
      undefined,
    );
    const call = parseRunAgentRequest({
      direct_tool: { action: "call", name: "list_clients", args: { q: "a" } },
    }).direct_tool;
    assertStrictEquals(call?.action, "call");
    assertEquals(call?.args, { q: "a" });
    assertEquals(
      parseRunAgentRequest({ direct_tool: { action: "list", args: "x" } })
        .direct_tool?.args,
      {},
    );
  },
);

Deno.test(
  "conversation turns keep user/assistant entries and stringify content",
  () => {
    assertEquals(
      readConversationTurns([
        { role: "user", content: "hi" },
        { role: "system", content: "x" },
        null,
        { role: "assistant", content: 5 },
        { role: "assistant" },
      ]),
      [
        { role: "user", content: "hi" },
        { role: "assistant", content: "5" },
        { role: "assistant", content: "" },
      ],
    );
    assertEquals(readConversationTurns({ role: "user" }), []);
  },
);

Deno.test("history messages keep user/assistant content as stored", () => {
  assertEquals(
    readHistoryMessages([
      { role: "user", content: [{ type: "text", text: "hi" }], extra: 1 },
      { role: "tool", content: "x" },
      ["user", "hi"],
      { role: "assistant", content: "ok" },
    ]),
    [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: "ok" },
    ],
  );
});

Deno.test(
  "embedded names are read only from objects with a string name",
  () => {
    assertStrictEquals(embeddedName({ name: "Acme" }), "Acme");
    assertStrictEquals(embeddedName({ name: 5 }), undefined);
    assertStrictEquals(embeddedName(null), undefined);
    assertStrictEquals(embeddedName("column 'type' does not exist"), undefined);
  },
);
