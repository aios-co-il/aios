import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  isSameInboundLead,
  leadPhoneVariants,
  pickDuplicateLead,
} from "./lead-duplicate-match.ts";

Deno.test("same email but different phone is a new lead", () => {
  assertStrictEquals(
    isSameInboundLead(
      { phone: "972534327783", email: "Aaaaa@gmail.com" },
      { phone: "+972547970059", email: "aaaaa@gmail.com" },
    ),
    false,
  );
});

Deno.test("same phone and same email is a returning lead", () => {
  assertStrictEquals(
    isSameInboundLead(
      { phone: "054-797-0059", email: "Tz@Mail.com" },
      { phone: "+972547970059", email: " tz@mail.com " },
    ),
    true,
  );
});

Deno.test("same phone but a different email is a new lead", () => {
  assertStrictEquals(
    isSameInboundLead(
      { phone: "0547970059", email: "a@mail.com" },
      { phone: "0547970059", email: "b@mail.com" },
    ),
    false,
  );
});

Deno.test("an email on only one side is a new lead", () => {
  assertStrictEquals(
    isSameInboundLead(
      { phone: "0547970059", email: null },
      { phone: "+972547970059", email: "a@mail.com" },
    ),
    false,
  );
  assertStrictEquals(
    isSameInboundLead(
      { phone: "0547970059", email: "a@mail.com" },
      { phone: "0547970059" },
    ),
    false,
  );
});

Deno.test("same phone and no email on either side is a returning lead", () => {
  assertStrictEquals(
    isSameInboundLead(
      { phone: "0547970059", email: null },
      {
        phone: "+972547970059",
      },
    ),
    true,
  );
});

Deno.test("no incoming phone never matches", () => {
  assertStrictEquals(
    isSameInboundLead(
      { phone: null, email: "a@mail.com" },
      {
        email: "a@mail.com",
      },
    ),
    false,
  );
});

Deno.test("picks the candidate whose email agrees", () => {
  const picked = pickDuplicateLead(
    [
      { id: "1", phone: "0547970059", email: "other@mail.com" },
      { id: "2", phone: "0547970059", email: "me@mail.com" },
    ],
    { phone: "0547970059", email: "me@mail.com" },
  );
  assertStrictEquals(picked?.id, "2");
});

Deno.test("phone variants cover local and international spellings", () => {
  assertEquals(leadPhoneVariants("+972547970059"), [
    "+972547970059",
    "972547970059",
    "0547970059",
  ]);
});
