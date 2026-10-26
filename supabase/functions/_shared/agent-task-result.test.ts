import assert from "node:assert/strict";
import test from "node:test";
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

test("asJsonObject keeps objects and reads anything else as empty", () => {
  assert.deepEqual(asJsonObject({ a: 1 }), { a: 1 });
  assert.deepEqual(asJsonObject(null), {});
  assert.deepEqual(asJsonObject(["x"]), {});
  assert.deepEqual(asJsonObject("x"), {});
});

test("taskResultOutput prefers final_output, else the last non-blank assistant message", () => {
  assert.equal(taskResultOutput({ final_output: "done" }), "done");
  assert.equal(
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
  assert.equal(taskResultOutput({ conversation_history: "x" }), undefined);
  assert.equal(taskResultOutput({}), undefined);
});

test("readWhatsAppNotify accepts complete targets and drops malformed ones", () => {
  assert.deepEqual(readWhatsAppNotify(notify), notify);
  assert.deepEqual(
    readWhatsAppNotify({
      ...notify,
      automation_id: undefined,
      phone_number: undefined,
    }),
    notify,
  );
  assert.deepEqual(readWhatsAppNotify({ ...notify, extra: 1 }), notify);
  assert.equal(readWhatsAppNotify({ ...notify, surface: "email" }), null);
  assert.equal(readWhatsAppNotify({ ...notify, chat_id: 5 }), null);
  assert.equal(readWhatsAppNotify({ ...notify, is_group: "true" }), null);
  assert.equal(readWhatsAppNotify(null), null);
  assert.equal(readWhatsAppNotify([notify]), null);
});
