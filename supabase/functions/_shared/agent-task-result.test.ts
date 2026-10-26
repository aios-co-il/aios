import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  asJsonObject,
  readWhatsAppNotify,
  taskResultOutput,
} from "./agent-task-result.ts";

const notify = {
  surface: "whatsapp",
  tenant_id: "t1",
  automation_id: null,
  connection_user_id: "u1",
  chat_id: "120363000000000000@g.us",
  phone_number: null,
  is_group: true,
};

Deno.test("asJsonObject keeps objects and reads anything else as empty", () => {
  assertEquals(asJsonObject({ a: 1 }), { a: 1 });
  assertEquals(asJsonObject(null), {});
  assertEquals(asJsonObject(["x"]), {});
  assertEquals(asJsonObject("x"), {});
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

Deno.test(
  "readWhatsAppNotify accepts complete targets and drops malformed ones",
  () => {
    assertEquals(readWhatsAppNotify(notify), notify);
    assertEquals(
      readWhatsAppNotify({
        ...notify,
        automation_id: undefined,
        phone_number: undefined,
      }),
      notify,
    );
    assertEquals(readWhatsAppNotify({ ...notify, extra: 1 }), notify);
    assertStrictEquals(
      readWhatsAppNotify({ ...notify, surface: "email" }),
      null,
    );
    assertStrictEquals(readWhatsAppNotify({ ...notify, chat_id: 5 }), null);
    assertStrictEquals(
      readWhatsAppNotify({ ...notify, is_group: "true" }),
      null,
    );
    assertStrictEquals(readWhatsAppNotify(null), null);
    assertStrictEquals(readWhatsAppNotify([notify]), null);
  },
);
