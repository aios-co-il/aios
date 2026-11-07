import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  asJsonObject,
  jsonObjectOrNull,
  readWhatsAppNotify,
  type WhatsAppNotify,
  taskResultOutput,
} from "./agent-task-result.ts";

const notify: WhatsAppNotify = {
  surface: "whatsapp",
  tenant_id: "t1",
  automation_id: null,
  connection_user_id: "u1",
  chat_id: "120363000000000000@g.us",
  phone_number: null,
  is_group: true,
};

Deno.test("asJsonObject keeps objects and reads anything else as empty", () => {
  assertEquals(asJsonObject({ a: 1, b: [null, { c: true }] }), {
    a: 1,
    b: [null, { c: true }],
  });
  assertEquals(asJsonObject(null), {});
  assertEquals(asJsonObject(["x"]), {});
  assertEquals(asJsonObject("x"), {});
  assertStrictEquals(jsonObjectOrNull(3), null);
});

Deno.test(
  "taskResultOutput prefers final_output, else the last non-blank assistant message",
  () => {
    assertStrictEquals(taskResultOutput({ final_output: "done" }), "done");
    assertStrictEquals(
      taskResultOutput({
        conversation_history: [
          { role: "assistant", content: "first" },
          null,
          { role: "user", content: "q" },
          { role: "assistant", content: "  " },
        ],
      }),
      "first",
    );
    assertStrictEquals(
      taskResultOutput({ conversation_history: "x" }),
      undefined,
    );
    assertStrictEquals(taskResultOutput({}), undefined);
  },
);

Deno.test("readWhatsAppNotify reads a complete target", () => {
  assertEquals(readWhatsAppNotify(notify), notify);
  assertEquals(readWhatsAppNotify({ ...notify, extra: 1 }), notify);
});

Deno.test(
  "readWhatsAppNotify tolerates partial targets like the old reads",
  () => {
    assertEquals(
      readWhatsAppNotify({
        surface: "whatsapp",
        chat_id: "972500000000@c.us",
      }),
      {
        surface: "whatsapp",
        chat_id: "972500000000@c.us",
        tenant_id: "",
        automation_id: null,
        connection_user_id: null,
        phone_number: null,
        is_group: false,
      },
    );
    const loose = readWhatsAppNotify({
      ...notify,
      connection_user_id: null,
      automation_id: 5,
      is_group: "true",
    });
    assertStrictEquals(loose?.connection_user_id, null);
    assertStrictEquals(loose?.automation_id, null);
    assertStrictEquals(loose?.is_group, true);
  },
);

Deno.test(
  "readWhatsAppNotify rejects non-WhatsApp or chat-less targets",
  () => {
    assertStrictEquals(
      readWhatsAppNotify({ ...notify, surface: "email" }),
      null,
    );
    assertStrictEquals(readWhatsAppNotify({ ...notify, chat_id: 5 }), null);
    assertStrictEquals(
      readWhatsAppNotify({ ...notify, chat_id: undefined }),
      null,
    );
    assertStrictEquals(readWhatsAppNotify(null), null);
    assertStrictEquals(readWhatsAppNotify([notify]), null);
  },
);
