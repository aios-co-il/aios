import assert from "node:assert/strict";
import test from "node:test";
import {
  isSameInboundLead,
  leadPhoneVariants,
  pickDuplicateLead,
} from "./lead-duplicate-match.ts";

test("same email but different phone is a new lead", () => {
  assert.equal(
    isSameInboundLead(
      { phone: "972534327783", email: "Aaaaa@gmail.com" },
      { phone: "+972547970059", email: "aaaaa@gmail.com" },
    ),
    false,
  );
});

test("same phone and same email is a returning lead", () => {
  assert.equal(
    isSameInboundLead(
      { phone: "054-797-0059", email: "Tz@Mail.com" },
      { phone: "+972547970059", email: " tz@mail.com " },
    ),
    true,
  );
});

test("same phone but a different email is a new lead", () => {
  assert.equal(
    isSameInboundLead(
      { phone: "0547970059", email: "a@mail.com" },
      { phone: "0547970059", email: "b@mail.com" },
    ),
    false,
  );
});

test("same phone with an email missing on one side still matches", () => {
  assert.equal(
    isSameInboundLead(
      { phone: "0547970059", email: null },
      {
        phone: "+972547970059",
        email: "a@mail.com",
      },
    ),
    true,
  );
  assert.equal(
    isSameInboundLead(
      { phone: "0547970059", email: "a@mail.com" },
      {
        phone: "0547970059",
      },
    ),
    true,
  );
});

test("no incoming phone never matches", () => {
  assert.equal(
    isSameInboundLead(
      { phone: null, email: "a@mail.com" },
      {
        email: "a@mail.com",
      },
    ),
    false,
  );
});

test("picks the candidate whose email agrees", () => {
  const picked = pickDuplicateLead(
    [
      { id: "1", phone: "0547970059", email: "other@mail.com" },
      { id: "2", phone: "0547970059", email: "me@mail.com" },
    ],
    { phone: "0547970059", email: "me@mail.com" },
  );
  assert.equal(picked?.id, "2");
});

test("phone variants cover local and international spellings", () => {
  assert.deepEqual(leadPhoneVariants("+972547970059"), [
    "+972547970059",
    "972547970059",
    "0547970059",
  ]);
});
