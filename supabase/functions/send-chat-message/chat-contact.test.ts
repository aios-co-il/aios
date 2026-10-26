import assert from "node:assert/strict";
import test from "node:test";
import { isChatContact } from "./chat-contact.ts";

test("accepts a contact row", () => {
  assert.equal(
    isChatContact({
      id: "c1",
      name: null,
      manychat_subscriber_id: "123",
      tenant_id: "t1",
    }),
    true,
  );
});

test("rejects rows without id or tenant", () => {
  assert.equal(isChatContact({ id: "c1" }), false);
  assert.equal(isChatContact(null), false);
  assert.equal(isChatContact({ id: "c1", tenant_id: "t1", name: 5 }), false);
});
