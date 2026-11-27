import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  SERVICE_ONLY_RUN_FIELDS,
  bindRunAgentCaller,
  runCallerPhone,
} from "./caller-trust.ts";

const USER = "22222222-2222-4222-8222-222222222222";

const OWNER = "11111111-1111-4111-8111-111111111111";

const forgedBody = () => ({
  tenant_id: "t1",
  user_id: OWNER,
  command_text: "כן 4821",
  surface: "whatsapp",
  lead_data: { phone: "+972500000000", channel: "whatsapp_private" },
  wa_notify: { surface: "whatsapp", chat_id: "972500000000@c.us" },
  model_override: "some-model",
  carmen_automation: { instructions: "x" },
  persona_user_id: OWNER,
});

Deno.test("bindRunAgentCaller", async (t) => {
  await t.step(
    "a user JWT runs as itself, without phone, WhatsApp target or whatsapp surface",
    () => {
      const body = bindRunAgentCaller(forgedBody(), {
        kind: "user",
        userId: USER,
      });
      assertStrictEquals(body.user_id, USER);

      for (const field of SERVICE_ONLY_RUN_FIELDS) {
        assertStrictEquals(field in body, false, `${field} must be stripped`);
      }

      assertStrictEquals(body.lead_data, undefined);
      assertStrictEquals(body.wa_notify, undefined);
      assertStrictEquals(body.persona_user_id, undefined);
      assertStrictEquals(body.surface, "internal_chat");
      assertStrictEquals(body.command_text, "כן 4821");
      assertStrictEquals(body.tenant_id, "t1");
    },
  );

  await t.step("in-app surfaces are kept for user callers", () => {
    for (const surface of ["internal_chat", "aios", "task", undefined]) {
      const body = bindRunAgentCaller(
        { surface },
        { kind: "user", userId: USER },
      );
      assertStrictEquals(body.surface, surface);
    }
  });

  await t.step(
    "service callers keep phone, WhatsApp target, surface and user",
    () => {
      const body = bindRunAgentCaller(forgedBody(), {
        kind: "service",
        userId: null,
      });
      assertEquals(body, forgedBody());
    },
  );

  await t.step(
    "an unknown caller kind is treated like a user without identity",
    () => {
      const body = bindRunAgentCaller(forgedBody(), {
        kind: "anon",
        userId: OWNER,
      });
      assertStrictEquals(body.user_id, null);
      assertStrictEquals(body.lead_data, undefined);
      assertStrictEquals(body.wa_notify, undefined);
      assertStrictEquals(body.surface, "internal_chat");
    },
  );
});

Deno.test("runCallerPhone", async (t) => {
  await t.step("reads only lead_data.phone", () => {
    assertStrictEquals(runCallerPhone({ lead_data: { phone: " " } }), null);
    assertStrictEquals(
      runCallerPhone({ lead_data: { phone: 972501112222 } }),
      "972501112222",
    );
    assertStrictEquals(
      runCallerPhone({ lead_data: { contact_phone: "+972 50-111-2222" } }),
      null,
    );
    assertStrictEquals(runCallerPhone({}), null);
  });
});
