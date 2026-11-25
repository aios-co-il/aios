import { assertEquals } from "jsr:@std/assert@1";
import { subagentNotify } from "./subagent-notify.ts";
import type { CarmenWaNotify } from "../../_shared/carmen-session-identity.ts";

Deno.test(
  "subagent delivery retains complete metadata including a nullable connection user",
  () => {
    const notify: CarmenWaNotify = {
      surface: "whatsapp",
      tenant_id: "tenant",
      automation_id: null,
      connection_user_id: null,
      chat_id: "chat",
      phone_number: null,
      is_group: true,
    };
    assertEquals(subagentNotify(notify), notify);
  },
);

Deno.test(
  "incomplete legacy metadata cannot masquerade as a complete subagent target",
  () => {
    assertEquals(
      subagentNotify({ surface: "whatsapp", chat_id: "chat" }),
      null,
    );
    assertEquals(subagentNotify(null), null);
  },
);

Deno.test("omitted optional WhatsApp target fields normalize to null", () => {
  assertEquals(
    subagentNotify({
      surface: "whatsapp",
      tenant_id: "tenant",
      chat_id: "chat",
      is_group: false,
    }),
    {
      surface: "whatsapp",
      tenant_id: "tenant",
      chat_id: "chat",
      is_group: false,
      automation_id: null,
      connection_user_id: null,
      phone_number: null,
    },
  );
});

Deno.test(
  "legacy private JIDs keep completion delivery when is_group is omitted",
  () => {
    assertEquals(
      subagentNotify({
        surface: "whatsapp",
        tenant_id: "tenant",
        chat_id: "972501234567@c.us",
      }),
      {
        surface: "whatsapp",
        tenant_id: "tenant",
        chat_id: "972501234567@c.us",
        is_group: false,
        automation_id: null,
        connection_user_id: null,
        phone_number: null,
      },
    );
  },
);

Deno.test(
  "an omitted group flag cannot turn a group or invalid target into a private chat",
  () => {
    for (const chat_id of ["120363000@g.us", "invalid"]) {
      assertEquals(
        subagentNotify({ surface: "whatsapp", tenant_id: "tenant", chat_id }),
        null,
      );
    }
  },
);

Deno.test("explicit group flags remain unchanged", () => {
  assertEquals(
    subagentNotify({
      surface: "whatsapp",
      tenant_id: "tenant",
      chat_id: "120363000@g.us",
      is_group: true,
    })?.is_group,
    true,
  );
});
