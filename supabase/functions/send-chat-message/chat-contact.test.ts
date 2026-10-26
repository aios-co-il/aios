import { assertStrictEquals } from "jsr:@std/assert@1";
import { isChatContact } from "./chat-contact.ts";

Deno.test("accepts a contact row", () => {
  assertStrictEquals(
    isChatContact({
      id: "c1",
      name: null,
      manychat_subscriber_id: "123",
      tenant_id: "t1",
    }),
    true,
  );
});

Deno.test("rejects rows without id or tenant", () => {
  assertStrictEquals(isChatContact({ id: "c1" }), false);
  assertStrictEquals(isChatContact(null), false);
  assertStrictEquals(
    isChatContact({ id: "c1", tenant_id: "t1", name: 5 }),
    false,
  );
});
