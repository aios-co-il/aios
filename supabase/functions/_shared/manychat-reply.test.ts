import assert from "node:assert/strict";
import test from "node:test";
import {
  findManyChatPhoneField,
  manyChatSuccessId,
  mentionsManyChatRateLimit,
} from "./manychat-reply.ts";

test("manyChatSuccessId returns data.id only for successful replies", () => {
  assert.equal(manyChatSuccessId({ status: "success", data: { id: 42 } }), 42);
  assert.equal(
    manyChatSuccessId({ status: "error", data: { id: 42 } }),
    undefined,
  );
  assert.equal(manyChatSuccessId({ status: "success", data: {} }), undefined);
  assert.equal(manyChatSuccessId({ __nonJson: true, status: 500 }), undefined);
  assert.equal(manyChatSuccessId(null), undefined);
});

test("mentionsManyChatRateLimit looks for max rps in the message", () => {
  assert.equal(mentionsManyChatRateLimit({ message: "max rps reached" }), true);
  assert.equal(mentionsManyChatRateLimit({ message: "other" }), false);
  assert.equal(mentionsManyChatRateLimit({}), false);
});

test("findManyChatPhoneField matches the phone_number field by name", () => {
  const reply = {
    status: "success",
    data: [null, { id: 1, name: "city" }, { id: 7, name: "Phone_Number" }],
  };
  assert.deepEqual(findManyChatPhoneField(reply), {
    id: 7,
    name: "Phone_Number",
  });
  assert.equal(findManyChatPhoneField({ status: "error", data: [] }), null);
  assert.equal(findManyChatPhoneField({ status: "success", data: {} }), null);
});
