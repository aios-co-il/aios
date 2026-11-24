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
