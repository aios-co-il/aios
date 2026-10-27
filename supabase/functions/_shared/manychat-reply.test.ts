import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  cachedManyChatFieldId,
  findManyChatPhoneField,
  manyChatSuccessId,
  mentionsManyChatRateLimit,
} from "./manychat-reply.ts";

Deno.test(
  "manyChatSuccessId returns data.id only for successful replies",
  () => {
    assertStrictEquals(
      manyChatSuccessId({ status: "success", data: { id: 42 } }),
      42,
    );
    assertStrictEquals(
      manyChatSuccessId({ status: "error", data: { id: 42 } }),
      undefined,
    );
    assertStrictEquals(
      manyChatSuccessId({ status: "success", data: {} }),
      undefined,
    );
    assertStrictEquals(
      manyChatSuccessId({ __nonJson: true, status: 500 }),
      undefined,
    );
    assertStrictEquals(manyChatSuccessId(null), undefined);
  },
);

Deno.test("mentionsManyChatRateLimit looks for max rps in the message", () => {
  assertStrictEquals(
    mentionsManyChatRateLimit({ message: "max rps reached" }),
    true,
  );
  assertStrictEquals(mentionsManyChatRateLimit({ message: "other" }), false);
  assertStrictEquals(mentionsManyChatRateLimit({}), false);
});

Deno.test(
  "findManyChatPhoneField matches the phone_number field by name",
  () => {
    const reply = {
      status: "success",
      data: [null, { id: 1, name: "city" }, { id: 7, name: "Phone_Number" }],
    };
    const phoneField = { id: 7, name: "Phone_Number" };
    assertEquals(findManyChatPhoneField(reply), phoneField);
    assertStrictEquals(
      findManyChatPhoneField({ status: "error", data: [] }),
      null,
    );
    assertStrictEquals(
      findManyChatPhoneField({ status: "success", data: {} }),
      null,
    );
  },
);

Deno.test(
  "cachedManyChatFieldId reads numeric ids and rejects the rest",
  () => {
    assertStrictEquals(cachedManyChatFieldId(12345), 12345);
    assertStrictEquals(cachedManyChatFieldId("12345"), 12345);
    for (const value of [undefined, null, "", 0, "abc", { id: 1 }, [7], true]) {
      assertStrictEquals(cachedManyChatFieldId(value), null);
    }
  },
);
