import assert from "node:assert/strict";
import { test } from "node:test";
import { providerMessageId, recipientVars } from "./recipient-vars.ts";

const row = {
  contact_name: "Dana Levi",
  email: "dana@example.com",
  phone: "0501234567",
  entity_type: "lead",
  vars: null,
};

test("recipientVars falls back to the recipient columns", () => {
  const vars = recipientVars(row);
  assert.equal(vars.contact_name, "Dana Levi");
  assert.equal(vars.email, "dana@example.com");
  assert.equal(vars.phone, "0501234567");
});

test("recipientVars hides the phone of WhatsApp groups", () => {
  assert.notEqual(
    recipientVars({ ...row, entity_type: "wa_group" }).phone,
    "0501234567",
  );
});

test("recipientVars lets stored vars win and stringifies them", () => {
  const vars = recipientVars({
    ...row,
    vars: { contact_name: "Dana", visits: 3, missing: null, ok: true },
  });
  assert.equal(vars.contact_name, "Dana");
  assert.equal(vars.visits, "3");
  assert.equal(vars.missing, "");
  assert.equal(vars.ok, "true");
});

test("providerMessageId reads a non-empty id as text", () => {
  assert.equal(providerMessageId({ id: "m1" }, "id"), "m1");
  assert.equal(providerMessageId({ idMessage: 42 }, "idMessage"), "42");
  assert.equal(providerMessageId({ id: "" }, "id"), undefined);
  assert.equal(providerMessageId(null, "id"), undefined);
  assert.equal(providerMessageId(["m1"], "0"), undefined);
});
